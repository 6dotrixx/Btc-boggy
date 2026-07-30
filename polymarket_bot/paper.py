"""Paper-trading ledger: simulates fills against live book prices.

The point of Phase 0/1 (see POLYMARKET_PLAN.md) is to measure how much arb
edge is *actually capturable* at our latency before risking real money. Every
simulated fill is printed to stdout (durable in Railway logs) and appended to
a JSON ledger.
"""

import json
import os
from datetime import datetime, timezone

from . import config


class PaperTrader:
    def __init__(self):
        self.bankroll = config.BANKROLL
        self.realized = 0.0
        self.fills = 0
        self.detected = 0            # candidate arbs seen (pre-fill)
        self.biggest = 0.0           # largest single locked profit
        self.by_kind = {}            # locked count per arb kind (set/ladder/…)
        self._seen = set()  # (market, yes_price, no_price) already taken this run
        self._load()

    def _load(self):
        if os.path.exists(config.LEDGER_PATH):
            with open(config.LEDGER_PATH) as f:
                state = json.load(f)
            self.bankroll = state.get("bankroll", self.bankroll)
            self.realized = state.get("realized", 0.0)
            self.fills = state.get("fills", 0)
            self.detected = state.get("detected", 0)
            self.biggest = state.get("biggest", 0.0)
            self.by_kind = dict(state.get("by_kind") or {})

    def note_detected(self, n=1):
        """Record that N arb candidates were spotted this scan (fill or not),
        so the paper run can report a real detected-vs-captured hit rate."""
        self.detected += n

    def _save(self, fill):
        state = {
            "bankroll": self.bankroll,
            "realized": self.realized,
            "fills": self.fills,
            "detected": self.detected,
            "biggest": round(self.biggest, 4),
            "by_kind": self.by_kind,
        }
        try:
            entries = []
            if os.path.exists(config.LEDGER_PATH):
                with open(config.LEDGER_PATH) as f:
                    entries = json.load(f).get("entries", [])
            entries.append(fill)
            state["entries"] = entries[-500:]
            with open(config.LEDGER_PATH, "w") as f:
                json.dump(state, f, indent=1)
        except OSError as e:
            print(f"ledger write failed (non-fatal): {e}", flush=True)

    def take(self, arb):
        """Simulate buying a full arb set (2-leg YES/NO or n-leg event set)."""
        cost_per_set = arb.get("cost") or (arb["yes_price"] + arb["no_price"])
        payout = arb.get("payout", 1.0)
        key = (arb.get("market") or arb.get("event"), cost_per_set)
        if key in self._seen:
            return None
        self._seen.add(key)

        affordable = self.bankroll / cost_per_set if cost_per_set > 0 else 0
        shares = min(arb["size"], affordable)
        if shares <= 0:
            return None

        profit = (payout - cost_per_set) * shares
        # Capital returns at resolution; paper model credits it immediately
        # since the set payout is locked. Track realized edge separately.
        self.realized += profit
        self.fills += 1
        kind = arb.get("kind", "arb")
        self.by_kind[kind] = self.by_kind.get(kind, 0) + 1
        self.biggest = max(self.biggest, profit)

        fill = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "kind": kind,
            "question": arb["question"][:80],
            "cost": round(cost_per_set, 4),
            "shares": round(shares, 2),
            "profit": round(profit, 4),
        }
        self._save(fill)
        return fill
