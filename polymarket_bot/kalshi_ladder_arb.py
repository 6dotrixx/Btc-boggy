"""Cross-strike (nested-threshold) arbitrage on Kalshi price ladders.

Threshold markets on one underlying/expiry are NESTED, so their prices must
stay monotonically ordered. When a stale or thin quote breaks that order, a
risk-free lock appears. Direction matters — get it wrong and the "arb" can pay
$0, so we classify every market first and only ever pair same-direction legs:

  ABOVE ladder  (YES if underlying >= K, Kalshi floor_strike):
      {>K2} ⊂ {>K1} for K1<K2  →  buy YES(low K1) + NO(high K2)
        >K2 : 1+0=1     K1..K2 : 1+1=2     <K1 : 0+1=1     → floor $1 ✓

  BELOW ladder  (YES if underlying <= K, Kalshi cap_strike):
      {<K1} ⊂ {<K2} for K1<K2  →  buy YES(high K2) + NO(low K1)
        <K1 : 1+0=1     K1..K2 : 1+1=2     >K2 : 0+1=1     → floor $1 ✓

Anything with BOTH strikes (a bracket) or NEITHER is not a nested threshold —
we skip it rather than risk a false lock. Payout is priced at the guaranteed
$1 floor; the middle-bracket $2 is upside we don't count.

Stage-1 detector off the bulk quotes; real depth is confirmed at execution.
"""

import os

from . import config, kalshi_api
from .kalshi_crypto import minutes_to_close

# Skip contracts within this many minutes of close — near-settlement quotes go
# wide/stale and manufacture false inversions.
MIN_MINUTES_LEFT = 2.0
# Hard ceiling on sets per catch, even if the book is deeper (belt-and-braces
# for live mode). Book depth and bankroll usually bind first.
MAX_SETS = int(os.environ.get("PM_ARB_MAX_SETS", "1000"))


def _classify(m):
    """(direction, strike) for a pure threshold market, else (None, None).

    ABOVE = floor_strike only; BELOW = cap_strike only. Brackets (both) and
    unknowns are rejected so we never pair non-nested legs.
    """
    fs, cs = m.get("floor_strike"), m.get("cap_strike")
    try:
        if fs not in (None, "") and cs in (None, ""):
            return "above", float(fs)
        if cs not in (None, "") and fs in (None, ""):
            return "below", float(cs)
    except (TypeError, ValueError):
        pass
    return None, None


def _group_key(m, direction):
    # Same underlying + expiry + direction share an event; fall back to close.
    return (m.get("event_ticker") or m.get("close_time"), direction)


def scan_ladders(markets):
    """Yield the best cross-strike arb per same-direction ladder (cents)."""
    min_edge_cents = config.MIN_EDGE * 100
    groups = {}
    for m in markets:
        direction, strike = _classify(m)
        if direction is None:
            continue
        ya, na = m.get("yes_ask") or 0, m.get("no_ask") or 0
        if not (1 <= ya <= 99) or not (1 <= na <= 99):
            continue
        mins = minutes_to_close(m)
        if mins is None or mins < MIN_MINUTES_LEFT:
            continue
        groups.setdefault(_group_key(m, direction), []).append((strike, m))

    for (key, direction), items in groups.items():
        if len(items) < 2:
            continue
        items.sort(key=lambda t: t[0])          # by strike, ascending
        best = None
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                (klo, mlo), (khi, mhi) = items[i], items[j]
                if khi <= klo:
                    continue
                if direction == "above":         # YES(low) + NO(high)
                    yleg, nleg = mlo, mhi
                else:                             # below: YES(high) + NO(low)
                    yleg, nleg = mhi, mlo
                yp, np_ = yleg["yes_ask"], nleg["no_ask"]
                fees = kalshi_api.taker_fee_cents(yp) + kalshi_api.taker_fee_cents(np_)
                edge = 100 - (yp + np_) - fees    # guaranteed $1 floor
                if edge >= min_edge_cents and (best is None or edge > best["edge"]):
                    best = {"edge": edge, "klo": klo, "khi": khi,
                            "yleg": yleg, "nleg": nleg, "yp": yp, "np": np_}
        if not best:
            continue
        yl, nl = best["yleg"], best["nleg"]
        yield {
            "kind": "ladder",
            "event": key,
            "market": f"{yl.get('ticker')}|{nl.get('ticker')}",
            "question": f"{direction} ladder ${best['klo']:.0f}/${best['khi']:.0f} "
                        f"[{yl.get('ticker')} YES + {nl.get('ticker')} NO]",
            "legs": [
                {"ticker": yl["ticker"], "side": "yes", "price": best["yp"]},
                {"ticker": nl["ticker"], "side": "no", "price": best["np"]},
            ],
            "cost": round((best["yp"] + best["np"]) / 100.0, 4),
            "payout": 1.0,
            "edge": round(best["edge"] / 100.0, 4),
            "size": 1,  # stage-1; real depth confirmed at execution
        }


def confirm_depth(arb):
    """Stage-2: re-price a candidate against live order books and size it to
    the real depth. Returns the arb with confirmed prices + max fillable
    `size`, or None if the edge evaporated (quotes moved) or a book is empty.

    Depth is the point: stage-1 flags the inversion at size 1; here we learn how
    many sets actually clear at a locking price and take the largest the thinner
    leg allows — that's what turns a 6c catch into real dollars.
    """
    confirmed = []
    for leg in arb["legs"]:
        book = kalshi_api.get_orderbook(leg["ticker"])
        quote = kalshi_api.best_cross(book, leg["side"])   # (ask_cents, depth)
        if not quote:
            return None
        ask, depth = quote
        if not (1 <= ask <= 99) or depth < 1:
            return None
        confirmed.append((leg, ask, depth))

    cost_c = sum(a for _, a, _ in confirmed)
    fees = sum(kalshi_api.taker_fee_cents(a) for _, a, _ in confirmed)
    edge_c = 100 - cost_c - fees                            # guaranteed $1 floor
    if edge_c < config.MIN_EDGE * 100:
        return None
    size = min(min(d for _, _, d in confirmed), MAX_SETS)
    if size < 1:
        return None
    return {
        **arb,
        "legs": [{**leg, "price": a} for leg, a, _ in confirmed],
        "cost": round(cost_c / 100.0, 4),
        "edge": round(edge_c / 100.0, 4),
        "size": size,
        "profit": round(edge_c / 100.0 * size, 4),
    }
