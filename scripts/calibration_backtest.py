"""Calibration backtest on SETTLED Kalshi markets (run on a GitHub runner).

Tests whether a high-win-rate 'buy the favorite' strategy is actually +EV on
Kalshi. Pulls resolved markets, buckets them by the last traded price (the
market's implied probability), and compares that to how often they ACTUALLY
resolved YES. If favorites priced ~75c resolved YES >75c+fee of the time, the
bias is real and profitable; if they resolved ~75%, the market is efficient and
the fee makes it a loser.

Public data only, no keys, no orders.
"""
import sys

from polymarket_bot import kalshi_api


def fetch_settled(target=4000):
    """Recent settled markets with a real last price and a yes/no result."""
    out, cursor = [], ""
    while len(out) < target:
        params = {"status": "settled", "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        resp = kalshi_api.session.get(
            f"{kalshi_api.base_url()}{kalshi_api.API}/markets",
            params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        for m in data.get("markets") or []:
            res = (m.get("result") or "").lower()
            lp = m.get("last_price")
            if res in ("yes", "no") and isinstance(lp, (int, float)) and 1 <= lp <= 99:
                out.append((int(lp), 1 if res == "yes" else 0))
        cursor = data.get("cursor")
        if not cursor:
            break
    return out


def main():
    print("=== KALSHI FAVORITE CALIBRATION BACKTEST ===", flush=True)
    try:
        rows = fetch_settled()
    except Exception as e:
        print(f"fetch failed: {e}")
        return 1
    if not rows:
        print("no settled markets with usable prices")
        return 1
    print(f"sample: {len(rows)} settled markets with a traded price + result\n")

    buckets = [(50, 60), (60, 70), (70, 80), (80, 90), (90, 99)]
    print(f"{'price band':>11} {'n':>6} {'won YES':>9} {'implied':>8} {'edge/trade':>11}")
    print("-" * 52)
    for lo, hi in buckets:
        grp = [(p, y) for p, y in rows if lo <= p < hi]
        if not grp:
            continue
        n = len(grp)
        yes_rate = sum(y for _, y in grp) / n
        avg_price = sum(p for p, _ in grp) / n
        fee = kalshi_api.taker_fee_cents(int(round(avg_price)))
        # Buy YES at avg_price: win 100 when it resolves YES.
        ev = yes_rate * 100 - avg_price - fee
        flag = "  <== +EV" if ev > 0 else ""
        print(f"{lo:>4}-{hi:<3}c {n:>6} {100*yes_rate:>8.1f}% {avg_price:>7.1f}c "
              f"{ev:>+10.2f}c{flag}")
    print("-" * 52)
    print("won YES% > implied price (after fee) = favorites underpriced = real edge.")
    print("won YES% ~ price = efficient; the fee makes buying favorites a loser.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
