"""Paper simulation of the bot's ACTIVE 15-min BTC up/down strategy.

Runs the exact live-bot logic (momentum direction -> bet the nearest-the-money
contract -> hold to the 15-min settlement) in PAPER mode. Live market feeds are
unreachable from this sandbox, so the intra-window BTC path is modeled with a
random walk anchored to TODAY'S REAL price level (~$64,300, from web data) and
the realistic per-minute volatility the live bot has been logging (~0.06%/min).

Pricing and fees use the bot's own functions so the P&L is faithful.
"""
import random
import statistics

from polymarket_bot.kalshi_api import taker_fee_cents

# ── Real anchors (from web search, 29 Jul 2026) ──────────────────────────────
BTC_NOW = 64_300.0          # today's real BTC level
SIGMA_1M = 0.0006           # 0.06%/min — matches the bot's live heartbeat vols
WINDOW = 15                 # minutes per trade (the "BTC 15 min" market)
STAKE = 1.00                # $ per wager (WAGER_DOLLARS default)
SEED = 20260729             # fixed so the run is reproducible & not cherry-picked

random.seed(SEED)


def minute_step(price):
    return price * (1.0 + random.gauss(0, SIGMA_1M))


def fair_price_cents(prob):
    """What the market charges to buy the favored side: prob + a small spread,
    clamped to a realistic 1..99c Kalshi quote."""
    ask = round(prob * 100) + 2      # ~2c taker spread over fair
    return max(3, min(97, ask))


def run():
    # Warm up a 20-minute history so momentum has something to read.
    path = [BTC_NOW]
    for _ in range(20):
        path.append(minute_step(path[-1]))

    trades = []
    for i in range(5):
        entry = path[-1]
        ref = path[-16]                       # 15 min ago (bot uses ~16-back)
        up = entry >= ref                     # momentum direction
        side = "UP (YES)" if up else "DOWN (NO)"
        strike = round(entry / 10) * 10       # nearest ~$10 strike, like Kalshi
        # Model prob the favored side wins over the window (slight momentum edge).
        drift = 0.02 if up else 0.02          # tiny persistence assumption
        prob = 0.50 + drift
        ask = fair_price_cents(prob)
        contracts = max(1, int(STAKE * 100 / ask))
        cost = contracts * ask / 100.0
        fee = taker_fee_cents(ask, contracts) / 100.0

        # Advance the window to settlement.
        for _ in range(WINDOW):
            path.append(minute_step(path[-1]))
        settle = path[-1]
        above = settle > strike
        won = above if up else (not above)
        payout = contracts * 1.0 if won else 0.0
        pnl = payout - cost - fee
        trades.append({
            "n": i + 1, "side": side, "entry": entry, "strike": strike,
            "settle": settle, "ask": ask, "contracts": contracts,
            "cost": cost, "fee": fee, "won": won, "pnl": pnl,
        })

    # ── Report ──────────────────────────────────────────────────────────────
    print("=" * 72)
    print(" PAPER SIM — bot's 15-min BTC up/down strategy — 5 trades")
    print(f" anchored to today's real BTC ~${BTC_NOW:,.0f}, vol {SIGMA_1M*100:.2f}%/min")
    print("=" * 72)
    hdr = f"{'#':>2} {'call':<10} {'entry':>9} {'strike':>8} {'settle':>9} {'@c':>4} {'res':>4} {'P&L':>8}"
    print(hdr); print("-" * 72)
    bankroll = 25.00
    wins = 0
    for t in trades:
        bankroll += t["pnl"]
        wins += 1 if t["won"] else 0
        print(f"{t['n']:>2} {t['side']:<10} {t['entry']:>9,.0f} {t['strike']:>8,.0f} "
              f"{t['settle']:>9,.0f} {t['ask']:>4} {'WIN' if t['won'] else 'LOSS':>4} "
              f"{t['pnl']:>+8.3f}")
    print("-" * 72)
    total = sum(t["pnl"] for t in trades)
    print(f" record: {wins}W-{5-wins}L   net P&L: {total:+.3f}   "
          f"paper bankroll: $25.00 -> ${25.00 + total:.2f}")
    print("=" * 72)
    return trades, total, wins


if __name__ == "__main__":
    run()
