"""Kalshi set-arb loop. Paper mode by default; PM_LIVE=1 + API keys go live.

Market data is public — paper mode needs NO credentials at all.
"""

import time
from datetime import datetime, timezone

from . import config, kalshi_api, kalshi_ladder_arb, kalshi_scanner
from .kalshi_crypto import SERIES as CRYPTO_SERIES
from .paper import PaperTrader


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def main():
    import os

    if config.LIVE or os.environ.get("PM_SELFTEST") == "1":
        from .selftest import run_preflight

        run_preflight(authed=bool(os.environ.get("KALSHI_API_KEY_ID")), log=log)

    live = None
    if config.LIVE:
        from .kalshi_executor import KalshiLiveExecutor

        live = KalshiLiveExecutor()
        log("🔴 LIVE MODE — orders will be placed with real funds")

    trader = PaperTrader()
    log(f"🔍 Kalshi set-arb bot started ({'LIVE' if live else 'PAPER'} mode)")
    log(
        f"bankroll=${trader.bankroll:.2f} | min_edge={config.MIN_EDGE:.3f} "
        f"(taker fees priced in per leg) | interval={config.SCAN_INTERVAL}s"
    )

    market_closed_logged = False
    while True:
        try:
            if not kalshi_api.trading_open():
                if not market_closed_logged:
                    log("⏸ exchange closed / maintenance — pausing until trading resumes")
                    market_closed_logged = True
                time.sleep(config.SCAN_INTERVAL)
                continue
            market_closed_logged = False

            def handle(arb):
                legs = " + ".join(f"{l['side'].upper()}@{l['price']}c" for l in arb["legs"])
                log(
                    f"💰 {arb['kind']} edge=${arb['edge']:.2f}/set size={arb['size']} "
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
                            f"   📝 paper fill: {fill['shares']} sets @ ${fill['cost']}, "
                            f"locked +${fill['profit']:.4f} "
                            f"(total +${trader.realized:.4f} over {trader.fills} fills)"
                        )

            events = kalshi_api.get_open_events()
            found = 0
            for arb in kalshi_scanner.scan(events):
                found += 1
                if not live:
                    trader.note_detected()
                handle(arb)

            # Cross-strike ladder arbs: nested threshold markets the event
            # scanner can't see. _classify() safely skips brackets, so this is
            # safe to run across EVERY event — the edges live in the illiquid,
            # boring markets where quotes go stale, not just crypto.
            def hunt_ladders(mkts):
                nonlocal found
                for cand in kalshi_ladder_arb.scan_ladders(mkts):
                    if not live:
                        trader.note_detected()
                    # Stage 2: confirm against live books and size to real depth
                    # before acting — a stage-1 flag at size 1 becomes the max
                    # the book allows, or is dropped if the edge has moved.
                    arb = kalshi_ladder_arb.confirm_depth(cand)
                    if arb:
                        found += 1
                        handle(arb)

            # Wide pass: every open event's nested markets (no extra fetch).
            for event in events:
                hunt_ladders(event.get("markets") or [])
            # Deep pass: full crypto strike ladders (paginated, more strikes).
            for series in CRYPTO_SERIES:
                try:
                    hunt_ladders(kalshi_api.get_markets(series))
                except Exception:
                    continue

            if found == 0:
                log(f"scanned {len(events)} events (set + ladder arbs) "
                    "— none above threshold")
        except Exception as e:
            if type(e).__name__ == "LegRiskError":
                log(f"🛑 {e}")
                raise
            log(f"⚠️ scan error: {e} — retrying next cycle")

        time.sleep(config.SCAN_INTERVAL)


if __name__ == "__main__":
    main()
