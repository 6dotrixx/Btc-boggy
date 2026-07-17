"""Live order execution via the official py-clob-client-v2.

Fires both legs of a set-arb as FAK (fill-and-kill) limit orders at the
scanned ask prices: we either take the displayed liquidity at our price or
the order dies — nothing rests on the book. If one leg fills and the other
doesn't, the filled leg is immediately unwound with a FAK sell (best effort)
and the incident is logged loudly.

Enable with (Railway env vars):
  PM_LIVE=1
  PM_PRIVATE_KEY=<polygon wallet private key holding USDC>
  PM_FUNDER=<proxy wallet address shown in Polymarket UI, if using one>

The wallet must hold USDC.e on Polygon with allowances set for the Polymarket
exchange contracts (done automatically on first deposit via the Polymarket UI,
or via client.update_balance_allowance()).
"""

import os

from . import config


POLYGON_CHAIN_ID = 137


class LegRiskError(RuntimeError):
    """One leg filled, the other didn't, and the unwind also failed."""


class LiveExecutor:
    def __init__(self):
        from py_clob_client_v2 import ClobClient  # imported lazily: paper mode needs no SDK

        key = os.environ.get("PM_PRIVATE_KEY", "")
        if not key:
            raise ValueError("PM_LIVE=1 requires PM_PRIVATE_KEY to be set")
        funder = os.environ.get("PM_FUNDER") or None
        # signature_type 1 = email/magic proxy wallet, 2 = browser-wallet proxy.
        sig_type = os.environ.get("PM_SIGNATURE_TYPE")

        self.client = ClobClient(
            host=config.CLOB_URL,
            chain_id=POLYGON_CHAIN_ID,
            key=key,
            signature_type=int(sig_type) if sig_type else None,
            funder=funder,
        )
        self.client.set_api_creds(self.client.create_or_derive_api_key())
        self.max_per_trade = float(os.environ.get("PM_MAX_PER_TRADE", str(config.BANKROLL)))

    def _fak_buy(self, token_id, price, size):
        from py_clob_client_v2 import OrderArgs, OrderType, Side

        return self.client.create_and_post_order(
            OrderArgs(token_id=token_id, price=price, size=size, side=Side.BUY),
            order_type=OrderType.FAK,
        )

    def _fak_sell(self, token_id, price, size):
        from py_clob_client_v2 import OrderArgs, OrderType, Side

        return self.client.create_and_post_order(
            OrderArgs(token_id=token_id, price=price, size=size, side=Side.SELL),
            order_type=OrderType.FAK,
        )

    @staticmethod
    def _filled_size(resp):
        """Size actually filled from a post-order response, best effort."""
        if not isinstance(resp, dict):
            return 0.0
        for key in ("makingAmount", "matchedAmount", "sizeMatched", "size_matched"):
            if resp.get(key) is not None:
                try:
                    return float(resp[key])
                except (TypeError, ValueError):
                    pass
        return 0.0

    def take(self, arb, yes_id, no_id):
        """Execute both legs of an arb. Returns a result dict for logging."""
        cost_per_set = arb["yes_price"] + arb["no_price"]
        shares = min(arb["size"], self.max_per_trade / cost_per_set)
        if shares < 5:  # exchange-side minimum order sizes make dust unfillable
            return {"status": "skipped", "reason": f"size {shares:.2f} too small"}

        yes_resp = self._fak_buy(yes_id, arb["yes_price"], shares)
        yes_filled = self._filled_size(yes_resp)

        no_resp = self._fak_buy(no_id, arb["no_price"], shares)
        no_filled = self._filled_size(no_resp)

        if yes_filled > 0 and no_filled > 0:
            matched = min(yes_filled, no_filled)
            result = {
                "status": "filled",
                "shares": matched,
                "locked_profit": (1.0 - cost_per_set) * matched,
            }
            # Unwind any unmatched excess on either side.
            excess_yes, excess_no = yes_filled - matched, no_filled - matched
            if excess_yes > 0:
                self._unwind(yes_id, arb["yes_price"], excess_yes, result)
            if excess_no > 0:
                self._unwind(no_id, arb["no_price"], excess_no, result)
            return result

        if yes_filled == 0 and no_filled == 0:
            return {"status": "missed", "reason": "neither leg filled"}

        # One naked leg — unwind it.
        token, price, filled = (
            (yes_id, arb["yes_price"], yes_filled)
            if yes_filled > 0
            else (no_id, arb["no_price"], no_filled)
        )
        result = {"status": "unwound", "shares": 0, "locked_profit": 0.0}
        self._unwind(token, price, filled, result)
        return result

    def _unwind(self, token_id, entry_price, size, result):
        """Sell back an unmatched position at (or slightly under) entry."""
        try:
            # Concede one cent to get out fast; worst case cost is size * $0.01.
            exit_price = max(round(entry_price - 0.01, 2), 0.01)
            self._fak_sell(token_id, exit_price, size)
            result.setdefault("unwinds", []).append(
                {"token": token_id, "size": size, "exit": exit_price}
            )
        except Exception as e:
            # A stuck naked leg is the one real risk of this strategy: halt.
            raise LegRiskError(
                f"UNWIND FAILED for token {token_id} size {size}: {e}. "
                "Bot halted — close the position manually in the Polymarket UI."
            ) from e
