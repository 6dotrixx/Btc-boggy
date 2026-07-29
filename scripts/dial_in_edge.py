"""Dial-in study: find the best-EV configuration of the fair-value edge mode.

The fair-value bot buys a contract only when its model says the price is
mispriced by more than EDGE cents after fees. Whether that's +EV depends on a
tug-of-war:

  • market spread + fee        -> a fixed cost that always drags P&L down
  • the bot's model ERROR       -> makes it *think* there's edge when there isn't
                                   (false signals it loses on)
  • real market mispricing      -> genuine cheap quotes it can pick off (+EV)

We sweep the EDGE threshold. Low edge = trades a lot on mostly-false signals
(loses). High edge = trades rarely but only on signals big enough to clear the
model noise (closer to +EV). We run it at several model-error levels so the
result isn't resting on one optimistic assumption.

Cents are used throughout; 100c = a $1 contract.
"""
import random

from polymarket_bot.kalshi_api import taker_fee_cents

OPPS_PER_DAY = 400        # contract-quotes the bot evaluates in a day
HALF_SPREAD = 1.5         # cents the ask sits above true mid
MARKET_NOISE = 1.5        # cents of random quote wobble around fair (pickable)
DAYS = 300                # long horizon so the average is stable


def run(edge, model_err, rng):
    trades = pnl_c = wins = 0
    for _ in range(OPPS_PER_DAY * DAYS):
        # A near-money contract with some true probability.
        true_p = rng.uniform(0.30, 0.70)           # cents = true_p*100
        fair_c = true_p * 100
        # Market quotes the favored side around fair + spread + noise.
        ask = fair_c + HALF_SPREAD + rng.gauss(0, MARKET_NOISE)
        ask = max(2, min(98, round(ask)))
        fee = taker_fee_cents(ask)
        # The bot's model estimate of fair — with its own error.
        est = fair_c + rng.gauss(0, model_err)
        # Edge the bot THINKS it sees on buying YES at this ask.
        seen_edge = est - ask - fee
        if seen_edge < edge:
            continue                                # bot passes
        trades += 1
        # Reality: it wins with the TRUE probability, not its estimate.
        won = rng.random() < true_p
        pnl_c += (100 - ask - fee) if won else (-ask - fee)
        wins += 1 if won else 0
    per_day = pnl_c / 100.0 / DAYS
    return {"edge": edge, "model_err": model_err, "trades_day": trades / DAYS,
            "win": (wins / trades if trades else 0), "pnl_day": per_day,
            "pnl_per_trade": (pnl_c / trades / 100.0 if trades else 0)}


def main():
    print("=" * 74)
    print(" DIAL-IN: fair-value edge mode — P&L per day vs edge threshold")
    print(f" (spread {HALF_SPREAD}c, market noise {MARKET_NOISE}c, {OPPS_PER_DAY} quotes/day)")
    print("=" * 74)
    for model_err in (1.0, 2.0, 3.0):
        print(f"\n model error = {model_err:.0f}c  (how far off the bot's price model is)")
        print(f"   {'edge':>5} {'trades/day':>11} {'win%':>6} {'$/trade':>9} {'$/day':>8}")
        best = None
        for edge in (1, 2, 3, 4, 5, 6, 8, 10):
            r = run(edge, model_err, random.Random(1000 + edge))
            tag = ""
            if best is None or r["pnl_day"] > best["pnl_day"]:
                best = r
            print(f"   {edge:>4}c {r['trades_day']:>11.1f} {100*r['win']:>5.0f}% "
                  f"{r['pnl_per_trade']:>+9.3f} {r['pnl_day']:>+8.2f}{tag}")
        print(f"   -> best: edge {best['edge']}c => {best['pnl_day']:+.2f}/day "
              f"on {best['trades_day']:.1f} trades")
    print("\n" + "=" * 74)
    print(" SET-ARBITRAGE (for comparison): buy YES+NO summing < 100c = locked")
    print(" profit, zero direction risk. Real but rare; each lock is a few cents.")
    print("=" * 74)


if __name__ == "__main__":
    main()
