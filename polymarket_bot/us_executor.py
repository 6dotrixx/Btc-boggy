"""Live execution on Polymarket US: fill-or-kill limit orders per leg.

FOK means each leg either fills completely at our price or not at all — no
partial fills to manage. If a later leg fails after earlier legs filled, the
filled legs are flattened via orders.close_position(); if that also fails the
bot halts (LegRiskError) so a human closes them in the app.
"""

import os

from .executor import LegRiskError  # shared halt semantics
from . import us_api


INTENT = {"LONG": "ORDER_INTENT_BUY_LONG", "SHORT": "ORDER_INTENT_BUY_SHORT"}


class USLiveExecutor:
    def __init__(self):
        if not (os.environ.get("POLYMARKET_KEY_ID") and os.environ.get("POLYMARKET_SECRET_KEY")):
            raise ValueError(
                "PM_LIVE=1 on venue 'us' requires POLYMARKET_KEY_ID and POLYMARKET_SECRET_KEY"
            )
        self.client = us_api.client()
        self.max_per_trade = float(os.environ.get("PM_MAX_PER_TRADE", "25"))

    def _fok_buy(self, slug, side, price, quantity):
        return self.client.orders.create(
            {
                "marketSlug": slug,
                "intent": INTENT[side],
                "type": "ORDER_TYPE_LIMIT",
                "price": {"value": f"{price:.2f}", "currency": "USD"},
                "quantity": int(quantity),
                "tif": "TIME_IN_FORCE_FILL_OR_KILL",
            }
        )

    @staticmethod
    def _filled(resp):
        order = (resp or {}).get("order", resp) or {}
        state = order.get("state", "")
        if state == "ORDER_STATE_FILLED":
            return True
        cum = order.get("cumQuantity")
        try:
            return cum is not None and int(cum) > 0
        except (TypeError, ValueError):
            return False

    def take(self, arb):
        """Execute every leg of a set arb. Returns a result dict for logging."""
        contracts = int(min(arb["size"], self.max_per_trade // max(arb["cost"], 0.01)))
        if contracts < 1:
            return {"status": "skipped", "reason": "size below 1 contract"}

        filled_legs = []
        for leg in arb["legs"]:
            try:
                resp = self._fok_buy(leg["slug"], leg["side"], leg["price"], contracts)
                ok = self._filled(resp)
            except Exception as e:
                resp, ok = {"error": str(e)}, False
            if not ok:
                if filled_legs:
                    self._flatten(filled_legs)
                    return {"status": "unwound", "failed_leg": leg["slug"]}
                return {"status": "missed", "failed_leg": leg["slug"]}
            filled_legs.append(leg)

        return {
            "status": "filled",
            "contracts": contracts,
            "locked_profit": (arb["payout"] - arb["cost"]) * contracts,
        }

    def _flatten(self, legs):
        for leg in legs:
            try:
                self.client.orders.close_position({"marketSlug": leg["slug"]})
            except Exception as e:
                raise LegRiskError(
                    f"UNWIND FAILED for {leg['slug']}: {e}. Bot halted — close the "
                    "position manually in the Polymarket app."
                ) from e
