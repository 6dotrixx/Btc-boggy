"""One-shot LIVE Kalshi arb scan — meant to run on a GitHub Actions runner
(open internet), not in the firewalled sandbox. Public market data only, no
keys, no orders. Prints what the arb engine actually finds on real markets
right now, plus a sample of real ladder quotes so we can see it reached Kalshi.
"""
import sys

from polymarket_bot import (
    kalshi_api,
    kalshi_ladder_arb,
    kalshi_scanner,
)
from polymarket_bot.kalshi_crypto import SERIES as CRYPTO_SERIES


def main():
    print("=== LIVE KALSHI ARB SCAN ===", flush=True)
    try:
        st = kalshi_api.exchange_status()
        print(f"exchange: active={st.get('exchange_active')} "
              f"trading={st.get('trading_active')} (host {kalshi_api.base_url()})")
    except Exception as e:
        print(f"could not reach Kalshi exchange status: {e}")
        return 1

    # ---- Set-arbs across all open events ----
    events = kalshi_api.get_open_events()
    print(f"\nscanned {len(events)} open events for set-arbs")
    set_arbs = list(kalshi_scanner.scan(events))
    for a in set_arbs:
        print(f"  💰 SET {a['kind']} edge=${a['edge']:.2f}/set size={a['size']} “{a['question'][:60]}”")
    print(f"  -> {len(set_arbs)} set-arb(s) found")

    # ---- Cross-strike ladder arbs on crypto ----
    print("\nscanning crypto strike ladders for inversions:")
    total_ladders = 0
    sample_shown = 0
    for series in CRYPTO_SERIES:
        try:
            mkts = kalshi_api.get_markets(series)
        except Exception as e:
            print(f"  {series}: fetch error {e}")
            continue
        cands = list(kalshi_ladder_arb.scan_ladders(mkts))
        # show a couple of REAL quotes per series to prove we hit live data
        priced = [m for m in mkts if (m.get('yes_ask') or 0) and (m.get('no_ask') or 0)]
        note = ""
        if priced and sample_shown < 6:
            s = priced[0]
            note = (f" | e.g. {s.get('ticker')} "
                    f"floor={s.get('floor_strike')} cap={s.get('cap_strike')} "
                    f"yes_ask={s.get('yes_ask')} no_ask={s.get('no_ask')}")
            sample_shown += 1
        print(f"  {series}: {len(mkts)} markets, {len(cands)} inversion(s){note}")
        for c in cands:
            total_ladders += 1
            conf = kalshi_ladder_arb.confirm_depth(c)
            if conf:
                print(f"    💰 LADDER edge=${conf['edge']:.2f}/set size={conf['size']} "
                      f"lock=${conf['edge']*conf['size']:.2f}  {conf['question'][:60]}")
            else:
                print(f"    (candidate {c['question'][:50]} — edge gone at book confirm)")

    print(f"\nSUMMARY: {len(set_arbs)} set-arbs, {total_ladders} ladder inversions "
          f"across {len(CRYPTO_SERIES)} crypto series. Public data only; no orders placed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
