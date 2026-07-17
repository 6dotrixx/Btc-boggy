"""Polymarket US set-arb loop (regulated exchange, key-based auth).

Selected automatically by main.py when POLYMARKET_KEY_ID is set (or force
with PM_VENUE=us). Paper mode by default; PM_LIVE=1 + credentials go live.
"""

import time
from datetime import datetime, timezone

from . import config, us_api, us_scanner
from .paper import PaperTrader


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def main():
    live = None
    if config.LIVE:
        from .us_executor import USLiveExecutor

        live = USLiveExecutor()
        log("🔴 LIVE MODE — orders will be placed with real funds")

    trader = PaperTrader()
    log(f"🔍 Polymarket US set-arb bot started ({'LIVE' if live else 'PAPER'} mode)")
    log(
        f"bankroll=${trader.bankroll:.2f} | min_edge={config.MIN_EDGE:.3f} "
        f"(+{us_scanner.FEE_BUFFER:.3f} fee buffer) | interval={config.SCAN_INTERVAL}s"
    )

    while True:
        try:
            events = us_api.get_active_events()
            found = 0
            for arb in us_scanner.scan(events):
                found += 1
                legs = " + ".join(f"{l['side']}@{l['price']}" for l in arb["legs"])
                log(
                    f"💰 {arb['kind']} edge={arb['edge']:.3f} size={arb['size']} "
                    f"“{arb['question'][:50]}” [{legs}]"
                )
                if live:
                    result = live.take(arb)
                    if result["status"] == "filled":
                        log(
                            f"   ✅ LIVE fill: {result['contracts']} sets, "
                            f"locked +${result['locked_profit']:.4f}"
                        )
                    else:
                        log(f"   ⚠️ live result: {result}")
                else:
                    fill = trader.take(arb)
                    if fill:
                        log(
                            f"   📝 paper fill: {fill['shares']} sets @ {fill['cost']}, "
                            f"locked +${fill['profit']:.4f} "
                            f"(total +${trader.realized:.4f} over {trader.fills} fills)"
                        )
            if found == 0:
                log(f"scanned {len(events)} events — no set arbs above threshold")
        except Exception as e:
            if type(e).__name__ == "LegRiskError":
                log(f"🛑 {e}")
                raise
            log(f"⚠️ scan error: {e} — retrying next cycle")

        time.sleep(config.SCAN_INTERVAL)


if __name__ == "__main__":
    main()
