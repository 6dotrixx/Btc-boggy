"""Polymarket set-arbitrage bot — scanner + paper trading + optional live execution.

Run locally:  python -m polymarket_bot.main
Railway:      process  polymarket: python -m polymarket_bot.main

Paper mode (default): no keys needed, simulates fills, logs capturable edge.
Live mode: set PM_LIVE=1, PM_PRIVATE_KEY (+ PM_FUNDER / PM_SIGNATURE_TYPE if
using a Polymarket proxy wallet). Only do this after the Phase 1 gate in
POLYMARKET_PLAN.md: >= 3 executable arbs/day with net edge >= 0.5%.

Other config: PM_BANKROLL, PM_MIN_EDGE, PM_SCAN_INTERVAL, PM_MAX_MARKETS,
PM_MIN_LIQUIDITY, PM_MAX_PER_TRADE (see config.py / executor.py).
"""

import time
from datetime import datetime, timezone

from . import api, config, scanner
from .paper import PaperTrader


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def main():
    import os

    venue = os.environ.get("PM_VENUE") or (
        "us" if os.environ.get("POLYMARKET_KEY_ID") else "crypto"
    )
    if venue == "us":
        from .us_main import main as us_main

        return us_main()

    live = None
    if config.LIVE:
        from .executor import LiveExecutor  # needs py-clob-client-v2 + keys

        live = LiveExecutor()
        log("🔴 LIVE MODE — orders will be placed with real funds")

    trader = PaperTrader()
    log(f"🔍 Polymarket set-arb bot started ({'LIVE' if live else 'PAPER'} mode)")
    log(
        f"bankroll=${trader.bankroll:.2f} | min_edge={config.MIN_EDGE:.3f} | "
        f"markets={config.MAX_MARKETS} | interval={config.SCAN_INTERVAL}s"
    )

    while True:
        try:
            markets = api.get_active_markets()
            found = 0
            for arb in scanner.scan(markets):
                found += 1
                log(
                    f"💰 ARB edge={arb['edge']:.3f} size={arb['size']:.0f} "
                    f"“{arb['question'][:60]}” YES={arb['yes_price']} NO={arb['no_price']}"
                )
                if live:
                    result = live.take(arb, arb["yes_id"], arb["no_id"])
                    if result["status"] == "filled":
                        log(
                            f"   ✅ LIVE fill: {result['shares']:.2f} sets, "
                            f"locked +${result['locked_profit']:.4f}"
                        )
                    else:
                        log(f"   ⚠️ live result: {result}")
                else:
                    fill = trader.take(arb)
                    if fill:
                        log(
                            f"   📝 paper fill: {fill['shares']} sets, "
                            f"locked +${fill['profit']:.4f} "
                            f"(total +${trader.realized:.4f} over {trader.fills} fills)"
                        )
            if found == 0:
                log(f"scanned {len(markets)} markets — no arbs above edge threshold")
        except Exception as e:
            # A stuck naked position needs a human — LegRiskError is fatal.
            if type(e).__name__ == "LegRiskError":
                log(f"🛑 {e}")
                raise
            log(f"⚠️ scan error: {e} — retrying next cycle")

        time.sleep(config.SCAN_INTERVAL)


if __name__ == "__main__":
    main()
