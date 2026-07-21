"""Railway entrypoint: supervises both bots in one service.

- BTC bot (Coinbase)      — started only if CB_API_KEY is set
- Polymarket set-arb bot  — always started; paper mode unless PM_LIVE=1

Children are restarted with backoff if they exit. Their stdout/stderr stream
straight to Railway logs.
"""

import os
import subprocess
import sys
import time


def build_jobs():
    """Each job: (name, argv, extra_env). Venues get separate paper ledgers."""
    jobs = []
    if os.environ.get("CB_API_KEY"):
        jobs.append(("btc", [sys.executable, "btc_bot.py"], {}))
    else:
        print("[supervisor] CB_API_KEY not set — BTC bot disabled", flush=True)

    pm_venue = "us" if os.environ.get("POLYMARKET_KEY_ID") else "crypto"
    bot = [sys.executable, "-m", "polymarket_bot.main"]
    jobs.append(
        ("polymarket", bot, {"PM_VENUE": pm_venue, "PM_LEDGER_PATH": "paper_ledger_pm.json"})
    )
    jobs.append(
        ("kalshi", bot, {"PM_VENUE": "kalshi", "PM_LEDGER_PATH": "paper_ledger_kalshi.json"})
    )
    return jobs


def main():
    jobs = build_jobs()
    procs = {}
    backoff = {name: 5 for name, _, _ in jobs}

    def spawn(name, cmd, extra_env):
        env = {**os.environ, **extra_env}
        return subprocess.Popen(cmd, env=env)

    specs = {name: (cmd, extra) for name, cmd, extra in jobs}
    for name, cmd, extra in jobs:
        print(f"[supervisor] starting {name}: {' '.join(cmd)}", flush=True)
        procs[name] = spawn(name, cmd, extra)

    while True:
        time.sleep(5)
        for name, proc in list(procs.items()):
            code = proc.poll()
            if code is None:
                continue
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
