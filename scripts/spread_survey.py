"""Live spread survey on Kalshi — does the market-making opportunity exist?

The bulk market feed doesn't carry live bid/ask, so we take the most-TRADED
active markets and pull each one's real order book, then measure the yes-side
spread = yes_ask - yes_bid. MM only profits where that spread is wide enough to
quote inside (~3c+, per mm_sim.py). Reports the real distribution on the liquid
markets that actually matter. Runs on a GitHub runner; public data, no orders.
"""
import sys
import time

from polymarket_bot import kalshi_api

SAMPLE = 45          # top-volume markets to pull books for (stay under rate limit)


def main():
    print("=== LIVE KALSHI SPREAD SURVEY (order books of top-traded markets) ===", flush=True)
    try:
        events = kalshi_api.get_open_events()
    except Exception as e:
        print(f"fetch failed: {e}")
        return 0

    mkts = []
    for ev in events:
        for m in ev.get("markets") or []:
            if m.get("status") == "active":
                mkts.append((m.get("volume") or 0, m.get("ticker", "?")))
    mkts.sort(reverse=True)                      # busiest first
    top = [t for _, t in mkts[:SAMPLE]]
    print(f"\n{len(mkts)} active markets; pulling books for the {len(top)} most-traded…\n")

    rows = []          # (spread, yes_bid, yes_ask, ticker)
    for tk in top:
        try:
            book = kalshi_api.get_orderbook(tk)
        except Exception:
            continue
        yes = book.get("yes") or []
        no = book.get("no") or []
        if not yes or not no:
            continue
        yes_bid = max(p for p, _ in yes)
        yes_ask = 100 - max(p for p, _ in no)
        if 1 <= yes_bid < yes_ask <= 99:
            rows.append((yes_ask - yes_bid, yes_bid, yes_ask, tk))
        time.sleep(0.1)

    if not rows:
        print("no two-sided books among the top markets (thin/one-sided) — bad sign for MM")
        return 0

    n = len(rows)
    print(f"{n} of the top markets have a real two-sided book:\n")
    bands = [(1, 1, "1c  (dead)"), (2, 2, "2c  (thin)"), (3, 4, "3-4c (workable)"),
             (5, 9, "5-9c (juicy)"), (10, 99, "10c+ (wide open)")]
    print(f"  {'spread band':<20} {'markets':>8} {'% ':>6}")
    print("  " + "-" * 38)
    workable = 0
    for lo, hi, label in bands:
        c = sum(1 for r in rows if lo <= r[0] <= hi)
        if c:
            print(f"  {label:<20} {c:>8} {100*c/n:>5.0f}%")
        if lo >= 3:
            workable += c
    print("  " + "-" * 38)
    med = sorted(r[0] for r in rows)[n // 2]
    print(f"  median spread: {med}c   |   MM-workable (>=3c): {workable}/{n}")
    print("\n  widest few:")
    for sp, yb, ya, tk in sorted(rows, reverse=True)[:6]:
        print(f"    {sp:>2}c   bid {yb}c / ask {ya}c   {tk}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
