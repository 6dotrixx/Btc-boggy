"""50-trade paper sim of the 15-min BTC up/down strategy + honest Monte-Carlo.

One detailed 50-trade run (seeded, reproducible) plus an aggregate over many
independent runs so the true expected P&L and variance are visible — not a
single cherry-picked path. Outcomes are driven by a zero-drift BTC random walk
anchored to today's real price/vol, so short-term direction is ~coinflip and
the only systematic force is the market spread + Kalshi fee.
"""
import random

from polymarket_bot.kalshi_api import taker_fee_cents

BTC_NOW = 64_300.0
SIGMA_1M = 0.0006      # 0.06%/min — matches the live bot's logged vols
WINDOW = 15
STAKE = 1.00
N_TRADES = 50


def one_run(rng):
    path = [BTC_NOW]
    for _ in range(20):
        path.append(path[-1] * (1.0 + rng.gauss(0, SIGMA_1M)))
    bankroll, wins, curve, rows = 25.00, 0, [25.00], []
    for i in range(N_TRADES):
        entry = path[-1]
        up = entry >= path[-16]
        strike = round(entry / 10) * 10
        ask = 52                      # near-money 15-min quote (~52c) + spread
        contracts = max(1, int(STAKE * 100 / ask))
        cost = contracts * ask / 100.0
        fee = taker_fee_cents(ask, contracts) / 100.0
        for _ in range(WINDOW):
            path.append(path[-1] * (1.0 + rng.gauss(0, SIGMA_1M)))
        settle = path[-1]
        won = (settle > strike) if up else (settle <= strike)
        pnl = (contracts * 1.0 - cost - fee) if won else (-cost - fee)
        bankroll += pnl
        wins += 1 if won else 0
        curve.append(round(bankroll, 3))
        rows.append({"n": i + 1, "up": up, "entry": entry, "strike": strike,
                     "settle": settle, "won": won, "pnl": pnl})
    return {"wins": wins, "net": bankroll - 25.00, "curve": curve, "rows": rows}


def main():
    # Detailed reproducible run
    detailed = one_run(random.Random(20260729))
    print("=" * 60)
    print(f" 50-TRADE PAPER RUN  (BTC ~${BTC_NOW:,.0f}, 15-min windows)")
    print("=" * 60)
    print(f" record: {detailed['wins']}W-{N_TRADES-detailed['wins']}L "
          f"({100*detailed['wins']/N_TRADES:.0f}% win)")
    print(f" net P&L: {detailed['net']:+.2f}   "
          f"bankroll: $25.00 -> ${25.00+detailed['net']:.2f}")
    print("=" * 60)

    # Monte-Carlo: the honest long-run picture
    RUNS = 5000
    nets = [one_run(random.Random(s))["net"] for s in range(RUNS)]
    avg = sum(nets) / RUNS
    profitable = sum(1 for n in nets if n > 0) / RUNS
    nets.sort()
    print(f" MONTE-CARLO over {RUNS} independent 50-trade runs:")
    print(f"   average net P&L : {avg:+.2f}   (per trade: {avg/N_TRADES:+.3f})")
    print(f"   runs profitable : {100*profitable:.0f}%")
    print(f"   worst / median / best : {nets[0]:+.2f} / "
          f"{nets[RUNS//2]:+.2f} / {nets[-1]:+.2f}")
    print("=" * 60)
    return detailed, avg, profitable, nets


if __name__ == "__main__":
    main()
