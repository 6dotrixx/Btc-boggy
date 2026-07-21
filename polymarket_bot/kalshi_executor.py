"""Live execution on Kalshi: immediate-or-cancel limit orders per leg.

Same discipline as the other venues: nothing rests on the book, a partially
completed set is unwound by selling the filled legs back, and a failed unwind
raises LegRiskError to halt the bot.
"""

import os

from . import kalshi_api
from .executor import LegRiskError


class KalshiLiveExecutor:
    def __init__(self):
        if not (os.environ.get("KALSHI_API_KEY_ID") and os.environ.get("KALSHI_PRIVATE_KEY_PEM")):
            raise ValueError(
                "PM_LIVE=1 on venue 'kalshi' requires KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PEM"
            )
        self.max_per_trade = float(os.environ.get("PM_MAX_PER_TRADE", "25"))
        from .canary import Canary

        self.canary = Canary("live_canary_arb.json")

    @staticmethod
    def _filled_count(order, requested):
        remaining = order.get("remaining_count")
        if remaining is not None:
            try:
                return max(0, requested - int(remaining))
            except (TypeError, ValueError):
                pass
        return requested if order.get("status") == "executed" else 0

    def take(self, arb):
        contracts = int(min(arb["size"], (self.max_per_trade * 100) // max(arb["cost"] * 100, 1)))
        contracts = self.canary.cap(contracts)  # 1-contract early live trades
        if contracts < 1:
            return {"status": "skipped", "reason": "size below 1 contract"}

        fills = []  # (leg, filled_count)
        for leg in arb["legs"]:
            try:
                order = kalshi_api.create_order(
                    leg["ticker"], leg["side"], "buy", contracts, leg["price"], ioc=True
                )
                filled = self._filled_count(order, contracts)
            except Exception:
                filled = 0
            if filled < contracts:
                # Incomplete set: unwind everything bought so far (including
                # any partial fill on this leg).
                if filled > 0:
                    fills.append((leg, filled))
                if fills:
                    self._flatten(fills)
                    return {"status": "unwound", "failed_leg": leg["ticker"]}
                return {"status": "missed", "failed_leg": leg["ticker"]}
            fills.append((leg, filled))

        self.canary.record()
        profit = (arb["payout"] - arb["cost"]) * contracts
        return {"status": "filled", "contracts": contracts, "locked_profit": profit}

    def _flatten(self, fills):
        for leg, count in fills:
            try:
                exit_price = max(leg["price"] - 2, 1)  # concede 2c to exit fast
                kalshi_api.create_order(
                    leg["ticker"], leg["side"], "sell", count, exit_price, ioc=True
                )
            except Exception as e:
                raise LegRiskError(
                    f"UNWIND FAILED for {leg['ticker']} x{count}: {e}. Bot halted — "
                    "close the position manually on Kalshi."
                ) from e
