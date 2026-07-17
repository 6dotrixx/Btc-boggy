"""Polymarket set-arbitrage scanner — Phase 0/1 (paper trading only).

Run locally:  python -m polymarket_bot.main
Railway:      add process  polymarket: python -m polymarket_bot.main
Config:       PM_BANKROLL, PM_MIN_EDGE, PM_SCAN_INTERVAL, PM_MAX_MARKETS,
              PM_MIN_LIQUIDITY (all optional; defaults in config.py)

Phase 1 gate (from POLYMARKET_PLAN.md): go live only after the scanner logs
>= 3 executable arbs/day with net edge >= 0.5% for a sustained stretch.
"""

import time
from datetime import datetime, timezone

from . import api, config, scanner
from .paper import PaperTrader


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def main():
    if config.LIVE:
        raise NotImplementedError(
            "Live trading is Phase 2+. Integrate the official Polymarket py-sdk "
            "and pass the Phase 1 gate in POLYMARKET_PLAN.md first."
        )

    trader = PaperTrader()
    log("🔍 Polymarket set-arb scanner started (PAPER MODE)")
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
                fill = trader.take(arb)
                if fill:
                    log(
                        f"   📝 paper fill: {fill['shares']} sets, "
                        f"locked profit +${fill['profit']:.4f} "
                        f"(total +${trader.realized:.4f} over {trader.fills} fills)"
                    )
            if found == 0:
                log(f"scanned {len(markets)} markets — no arbs above edge threshold")
        except Exception as e:
            log(f"⚠️ scan error: {e} — retrying next cycle")

        time.sleep(config.SCAN_INTERVAL)


if __name__ == "__main__":
    main()
