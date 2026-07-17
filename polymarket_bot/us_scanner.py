"""Set-arbitrage detection on Polymarket US.

Polymarket US uses one order book per market with LONG/SHORT sides, so
YES+NO-under-$1 inside a single book cannot exist (that would be a crossed
book). The set arb lives ACROSS the outcome markets of one event:

- LONG set:  sum of asks across all outcomes < $1  -> buy LONG every outcome;
  exactly one pays $1.
- SHORT set: sum of bids across all outcomes > $1  -> buy SHORT every outcome
  (cost 1 - bid each); all but one pay $1, locking (sum(bids) - 1) per set.

Both require the event's markets to be MUTUALLY EXCLUSIVE AND EXHAUSTIVE.
That's guaranteed for 2-market events (game winner: either team wins), which
is what we scan by default. Events with more outcomes (championship fields)
are only scanned if their slug is in PM_US_EVENT_ALLOWLIST, because an event
page can also bundle independent markets where this math would be wrong.
"""

import os

from . import config, us_api


# Extra edge demanded to cover exchange commissions (fraction of $1 payout).
FEE_BUFFER = float(os.environ.get("PM_US_FEE_BUFFER", "0.02"))

ALLOWLIST = {
    s.strip() for s in os.environ.get("PM_US_EVENT_ALLOWLIST", "").split(",") if s.strip()
}


def _scannable(event):
    markets = [
        m for m in (event.get("markets") or []) if m.get("active") and not m.get("closed")
    ]
    if len(markets) == 2:
        return markets
    if len(markets) > 2 and event.get("slug") in ALLOWLIST:
        return markets
    return None


def scan(events):
    """Yield arb dicts across events. Depth-capped, fee-buffered."""
    min_edge = config.MIN_EDGE + FEE_BUFFER
    for event in events:
        markets = _scannable(event)
        if not markets:
            continue

        quotes = []
        ok = True
        for m in markets:
            bid, ask, bid_depth, ask_depth = us_api.get_bbo(m["slug"])
            if bid is None or ask is None:
                ok = False
                break
            quotes.append({"slug": m["slug"], "bid": bid, "ask": ask,
                           "bid_depth": bid_depth, "ask_depth": ask_depth})
        if not ok:
            continue

        ask_sum = sum(q["ask"] for q in quotes)
        bid_sum = sum(q["bid"] for q in quotes)

        if 1.0 - ask_sum >= min_edge:
            yield {
                "kind": "long_set",
                "event": event.get("slug"),
                "question": event.get("title", "?"),
                "legs": [{"slug": q["slug"], "side": "LONG", "price": q["ask"]} for q in quotes],
                "cost": round(ask_sum, 4),
                "payout": 1.0,
                "edge": round(1.0 - ask_sum, 4),
                "size": min(q["ask_depth"] for q in quotes),
            }
        elif bid_sum - 1.0 >= min_edge:
            legs = [
                {"slug": q["slug"], "side": "SHORT", "price": round(1.0 - q["bid"], 4)}
                for q in quotes
            ]
            cost = sum(l["price"] for l in legs)
            yield {
                "kind": "short_set",
                "event": event.get("slug"),
                "question": event.get("title", "?"),
                "legs": legs,
                "cost": round(cost, 4),
                "payout": len(quotes) - 1.0,
                "edge": round(bid_sum - 1.0, 4),
                "size": min(q["bid_depth"] for q in quotes),
            }
