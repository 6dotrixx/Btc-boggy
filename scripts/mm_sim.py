"""Market-making profitability simulator for Kalshi (maker fee = 0 on standard
markets, the key enabler).

We post a two-sided quote: bid at mid-s, ask at mid+s (s = half-spread, cents).
Fills come from two kinds of flow:
  - NOISE traders hit us randomly -> we capture the half-spread s (good).
  - INFORMED traders hit the side about to be wrong, then the mid moves `delta`
    against us -> we lose (delta - s) on that fill (bad, "adverse selection").

Net edge per fill = (1-a)*s - a*(delta - s), where a = informed fraction.
Break-even informed fraction a* = s / delta. Below it, MM profits; above it, it
bleeds. We sweep a at realistic Kalshi spreads to see where the line is.
No fee term: standard-market maker fee is $0, so it drops out entirely.
"""

FILLS_PER_DAY = 120          # modest two-sided flow on one market
SCENARIOS = [
    ("quiet/illiquid market", 3, 5),   # (label, half_spread s, adverse move delta)
    ("normal market",          2, 4),
    ("tight/efficient market", 1, 4),
]


def edge_per_fill(s, delta, a):
    return (1 - a) * s - a * (delta - s)      # cents; maker fee = 0


def main():
    print("=" * 66)
    print(" MARKET-MAKING SIM — net $/day vs how much flow is INFORMED")
    print(f" (maker fee = $0, {FILLS_PER_DAY} fills/day, capture spread or eat adverse move)")
    print("=" * 66)
    infos = [0.20, 0.30, 0.40, 0.50, 0.60]
    for label, s, delta in SCENARIOS:
        star = s / delta
        print(f"\n {label}: quote ±{s}c, adverse move {delta}c  ->  break-even at "
              f"{100*star:.0f}% informed")
        print(f"   {'informed flow':>14} {'$/fill':>9} {'$/day':>9}")
        for a in infos:
            e = edge_per_fill(s, delta, a)
            day = e * FILLS_PER_DAY / 100.0
            tag = "  ✅" if day > 0 else "  ❌"
            print(f"   {100*a:>12.0f}% {e:>+8.3f}c {day:>+8.2f}{tag}")
    print("\n" + "=" * 66)
    print(" Read: MM profits whenever informed flow < spread/adverse-move.")
    print(" Wider spreads + noisier (illiquid) markets = more room to profit.")
    print("=" * 66)


if __name__ == "__main__":
    main()
