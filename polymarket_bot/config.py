"""Configuration — all tunables come from environment variables (Railway vars)."""

import os

# Bankroll the paper trader is allowed to deploy per arb (USD).
BANKROLL = float(os.environ.get("PM_BANKROLL", "25.0"))

# Minimum net edge (as a fraction of $1 payout) before an arb is acted on.
# 0.005 = half a cent per share. Buffer against taker fees and stale books.
MIN_EDGE = float(os.environ.get("PM_MIN_EDGE", "0.005"))

# Seconds between full scan passes.
SCAN_INTERVAL = int(os.environ.get("PM_SCAN_INTERVAL", "30"))

# How many markets to pull from Gamma per scan (ordered by volume).
MAX_MARKETS = int(os.environ.get("PM_MAX_MARKETS", "200"))

# Only scan markets with at least this much liquidity (Gamma "liquidityNum").
MIN_LIQUIDITY = float(os.environ.get("PM_MIN_LIQUIDITY", "1000"))

# Paper-trading ledger location (Railway filesystem is ephemeral; logs are the
# durable record — every fill is also printed to stdout).
LEDGER_PATH = os.environ.get("PM_LEDGER_PATH", "paper_ledger.json")

# Phase 0/1 is paper-only. Live execution arrives with py-sdk integration and
# is intentionally impossible to enable by accident: this flag only unlocks a
# NotImplementedError path for now.
LIVE = os.environ.get("PM_LIVE", "0") == "1"

GAMMA_URL = "https://gamma-api.polymarket.com"
CLOB_URL = "https://clob.polymarket.com"

REQUEST_TIMEOUT = 15
