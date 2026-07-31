"""Live spread survey on Kalshi — does the market-making opportunity exist?

MM only profits where the bid-ask spread is wide enough to quote inside and
still capture edge (from mm_sim.py: ~3c+ is the sweet spot, 1c is dead). This
scans live public markets, measures the real yes-side spread on every market
with a two-sided quote, and reports how many sit in the MM-profitable zone —
plus a rough daily-opportunity estimate. Run on a GitHub runner (open net).
Public data only, no keys, no orders.
"""
import sys

from polymarket_bot import kalshi_api


def main():
    print("=== LIVE KALSHI SPREAD SURVEY (market-making opportunity) ===", flush=True)
    try:
        events = kalshi_api.get_open_events()
    except Exception as e:
        print(f"fetch failed: {e}")
        return 0

    spreads = []       # (spread_cents, volume, ticker)
    for ev in events:
        for m in ev.get("markets") or []:
            if m.get("status") != "active":
                continue
            yb, ya = m.get("yes_bid") or 0, m.get("yes_ask") or 0
            if not (1 <= yb < ya <= 99):        # need a real two-sided quote
                continue
            spreads.append((ya - yb, m.get("volume") or 0, m.get("ticker", "?")))

    if not spreads:
        print("no two-sided markets found")
        return 0

    n = len(spreads)
    print(f"\nscanned {len(events)} events → {n} markets with a live two-sided quote\n")
    bands = [(1, 1, "1c  (dead — no room)"), (2, 2, "2c  (thin)"),
             (3, 4, "3-4c (workable)"), (5, 9, "5-9c (juicy)"), (10, 99, "10c+ (wide open)")]
    print(f"  {'spread band':<22} {'markets':>8} {'% of book':>10} {'w/ volume>0':>12}")
    print("  " + "-" * 56)
    profitable = 0
    for lo, hi, label in bands:
        grp = [s for s in spreads if lo <= s[0] <= hi]
        if not grp:
            continue
        withvol = sum(1 for s in grp if s[1] > 0)
        if lo >= 3:
            profitable += withvol
        print(f"  {label:<22} {len(grp):>8} {100*len(grp)/n:>9.0f}% {withvol:>12}")
    print("  " + "-" * 56)
    med = sorted(s[0] for s in spreads)[n // 2]
    print(f"  median spread: {med}c   |   MM-workable markets (>=3c AND traded): {profitable}")
    # Rough ceiling: capture ~half the spread per round-trip, a few fills/day each.
    est = profitable * 0.02 * 3   # $/day very rough (2c edge x ~3 fills)
    print(f"  crude daily-opportunity ceiling across those markets: ~${est:.2f}/day")
    print("\n  (workable = spread wide enough to quote inside AND has real trading)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
