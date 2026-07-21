"""Railway entrypoint: supervises all bots in one service + live dashboard.

- BTC bot (Coinbase)        — started only if CB_API_KEY is set
- Polymarket set-arb bot    — venue us/crypto by keys; paper unless PM_LIVE=1
- Kalshi set-arb bot        — always started; paper unless PM_LIVE=1 + keys
- Dashboard                 — HTML status page + JSON API on $PORT

Children are restarted with backoff if they exit. Their output streams to
Railway logs (prefixed per bot) AND into the dashboard's ring buffers.
"""

import os
import subprocess
import sys
import threading
import time
from collections import deque

import dashboard


def build_jobs():
    """Each job: (name, argv, extra_env). Venues get separate paper ledgers."""
    jobs = []
    if os.environ.get("CB_API_KEY"):
        jobs.append(("btc", [sys.executable, "-u", "btc_bot.py"], {}))
    else:
        print("[supervisor] CB_API_KEY not set — BTC bot disabled", flush=True)

    bot = [sys.executable, "-u", "-m", "polymarket_bot.main"]
    if os.environ.get("POLYMARKET_KEY_ID"):
        jobs.append(
            ("polymarket", bot, {"PM_VENUE": "us", "PM_LEDGER_PATH": "paper_ledger_pm.json"})
        )
    else:
        print("[supervisor] POLYMARKET_KEY_ID not set — Polymarket bot disabled "
              "(Kalshi focus)", flush=True)
    jobs.append(
        ("kalshi", bot, {"PM_VENUE": "kalshi", "PM_LEDGER_PATH": "paper_ledger_kalshi.json"})
    )
    jobs.append(("kalshi-crypto", bot, {"PM_VENUE": "kalshi-crypto"}))
    return jobs


def spawn(name, cmd, extra_env):
    proc = subprocess.Popen(
        cmd,
        env={**os.environ, **extra_env},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    def reader():
        for line in proc.stdout:
            print(f"[{name}] {line}", end="", flush=True)
            dashboard.STATE[name]["lines"].append(line)

    threading.Thread(target=reader, daemon=True).start()
    return proc


def main():
    jobs = build_jobs()
    for name, _, _ in jobs:
        dashboard.STATE[name] = {"alive": True, "lines": deque(maxlen=200)}
    dashboard.start()

    procs = {}
    backoff = {name: 5 for name, _, _ in jobs}
    specs = {name: (cmd, extra) for name, cmd, extra in jobs}

    for name, cmd, extra in jobs:
        print(f"[supervisor] starting {name}: {' '.join(cmd)}", flush=True)
        procs[name] = spawn(name, cmd, extra)

    while True:
        time.sleep(5)
        for name, proc in list(procs.items()):
            code = proc.poll()
            if code is None:
                dashboard.STATE[name]["alive"] = True
                continue
            dashboard.STATE[name]["alive"] = False
            wait = backoff[name]
            print(
                f"[supervisor] {name} exited with code {code} — restarting in {wait}s",
                flush=True,
            )
            time.sleep(wait)
            backoff[name] = min(wait * 2, 300)
            procs[name] = spawn(name, *specs[name])


if __name__ == "__main__":
    main()
