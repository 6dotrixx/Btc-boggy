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
    jobs = []
    if os.environ.get("CB_API_KEY"):
        jobs.append(("btc", [sys.executable, "btc_bot.py"]))
    else:
        print("[supervisor] CB_API_KEY not set — BTC bot disabled", flush=True)
    jobs.append(("polymarket", [sys.executable, "-m", "polymarket_bot.main"]))
    return jobs


def main():
    jobs = build_jobs()
    procs = {}
    backoff = {name: 5 for name, _ in jobs}

    for name, cmd in jobs:
        print(f"[supervisor] starting {name}: {' '.join(cmd)}", flush=True)
        procs[name] = subprocess.Popen(cmd)

    cmds = dict(jobs)
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
            procs[name] = subprocess.Popen(cmds[name])


if __name__ == "__main__":
    main()
