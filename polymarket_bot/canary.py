"""Canary mode for first live trades.

The live order path is tested against mocks, not the real Kalshi API. To prove
it end-to-end with minimal money at risk, the first N live trades per strategy
are forced to 1 contract (~$0.50). After N successful live fills, full sizing
unlocks automatically. Tune with PM_CANARY_TRADES (0 disables).
"""

import json
import os

N = int(os.environ.get("PM_CANARY_TRADES", "5"))


class Canary:
    def __init__(self, path):
        self.path = path
        self.n = N

    def _count(self):
        try:
            with open(self.path) as f:
                return int(json.load(f).get("count", 0))
        except (OSError, ValueError):
            return 0

    def active(self):
        return self._count() < self.n

    def cap(self, contracts):
        """Force 1 contract while in the canary phase."""
        return 1 if self.active() else contracts

    def record(self):
        """Count one successful live fill. Returns new count."""
        c = self._count() + 1
        try:
            with open(self.path, "w") as f:
                json.dump({"count": c}, f)
        except OSError:
            pass
        return c

    def note(self):
        """Human-readable status for logs, or '' once unlocked."""
        c = self._count()
        return f" [CANARY {c}/{self.n}: 1-contract test trades]" if c < self.n else ""
