"""Cross-strike (nested-threshold) arbitrage on Kalshi price ladders.

Threshold markets on one underlying/expiry are NESTED, not mutually exclusive:

    P(X > K1) >= P(X > K2)   for every K1 < K2.

The event-set scanner skips these (they aren't `mutually_exclusive`), yet a
ladder can still misprice — a stale or thin quote inverts the relationship. When
that happens you can buy YES on the LOWER strike and NO on the HIGHER strike for
under $1 and lock a guaranteed dollar no matter where the underlying settles:

    settle > K2   : YES(>K1) $1 + NO(>K2) $0  = $1
    K1<settle<K2  : YES(>K1) $1 + NO(>K2) $1  = $2   (bonus, not promised)
    settle < K1   : YES(>K1) $0 + NO(>K2) $1  = $1

Worst case is $1, so any total cost below $1 (after fees) is risk-free. We price
only the guaranteed $1; the middle-bracket $2 is upside we don't count.

This is a stage-1 detector off the bulk quotes — real depth is confirmed at
execution, same as the event scanner.
"""

from . import config, kalshi_api
from .kalshi_crypto import minutes_to_close, parse_strike

# Skip contracts within this many minutes of close — near-settlement quotes go
# wide/stale and manufacture false inversions.
MIN_MINUTES_LEFT = 2.0


def _group_key(m):
    # Same underlying + expiry share an event ticker; fall back to close time.
    return m.get("event_ticker") or m.get("close_time")


def scan_ladders(markets):
    """Yield the best cross-strike arb per ladder group (prices in cents)."""
    min_edge_cents = config.MIN_EDGE * 100
    groups = {}
    for m in markets:
        strike = parse_strike(m)
        ya, na = m.get("yes_ask") or 0, m.get("no_ask") or 0
        if not strike or not (1 <= ya <= 99) or not (1 <= na <= 99):
            continue
        mins = minutes_to_close(m)
        if mins is None or mins < MIN_MINUTES_LEFT:
            continue
        groups.setdefault(_group_key(m), []).append((strike, m))

    for key, items in groups.items():
        if len(items) < 2:
            continue
        items.sort(key=lambda t: t[0])
        best = None
        for i in range(len(items)):
            k1, m1 = items[i]
            y1 = m1.get("yes_ask")
            for j in range(i + 1, len(items)):
                k2, m2 = items[j]
                if k2 <= k1:
                    continue
                n2 = m2.get("no_ask")
                fees = kalshi_api.taker_fee_cents(y1) + kalshi_api.taker_fee_cents(n2)
                edge = 100 - (y1 + n2) - fees        # guaranteed $1 payout floor
                if edge >= min_edge_cents and (best is None or edge > best["edge"]):
                    best = {"edge": edge, "k1": k1, "k2": k2,
                            "m1": m1, "m2": m2, "y1": y1, "n2": n2}
        if not best:
            continue
        m1, m2 = best["m1"], best["m2"]
        yield {
            "kind": "ladder",
            "event": key,
            "market": key,
            "question": f">{best['k1']:.0f} YES + >{best['k2']:.0f} NO "
                        f"[{m1.get('ticker')} / {m2.get('ticker')}]",
            "legs": [
                {"ticker": m1["ticker"], "side": "yes", "price": best["y1"]},
                {"ticker": m2["ticker"], "side": "no", "price": best["n2"]},
            ],
            "cost": round((best["y1"] + best["n2"]) / 100.0, 4),
            "payout": 1.0,
            "edge": round(best["edge"] / 100.0, 4),
            "size": 1,  # stage-1; real depth confirmed at execution
        }
