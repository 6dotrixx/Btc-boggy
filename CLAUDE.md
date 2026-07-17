# Btc-boggy — project notes for Claude

Two trading bots deploy from `main` to a single Railway service
(`railway.toml` → `python run_all.py`):

- `btc_bot.py` — Coinbase BTC bot (EMA/RSI/ADX). Runs only if CB_API_KEY is set.
- `polymarket_bot/` — Polymarket set-arbitrage bot. Paper mode by default.
  Venue auto-select: POLYMARKET_KEY_ID set → Polymarket US (regulated, the
  owner has access); otherwise crypto CLOB. Strategy, research findings, and
  the staged $25→$100/day plan are in POLYMARKET_PLAN.md.

## State as of 2026-07-17

- All code merged to `main` and pushed; Railway should be running it.
  Feature branch: `claude/polymarket-bot-strategies-tn3pn3`.
- Live trading is gated: PM_LIVE=1 + credentials + PM_MAX_PER_TRADE (keep 25).
  Owner has agreed to run PAPER MODE FIRST and review results before going live
  (gate: ≥3 arbs/day at ≥0.5% net edge in the logs).
- 2026-07-17, second session: network is STILL blocked. The session
  environment's egress policy returns 403 (org policy denial) for
  backboard.railway.app, railway.app, railway.com, api.polymarket.us,
  clob.polymarket.com, gamma-api.polymarket.com, and api.coinbase.com.
  Only GitHub and package registries (npm/PyPI) are reachable. The proxy
  docs say policy denials must not be retried or routed around.
- Fix (owner, before starting the next session): in claude.ai/code, open
  the settings for the environment this repo's sessions use and change
  Network access to allow the domains above (or full network access), then
  start a NEW session — the policy is fixed when a session's container is
  created, so changing it does not help an already-running session. Docs:
  https://code.claude.com/docs/en/claude-code-on-the-web
- Code sanity-checked offline this session: `run_all.py` and all of
  `polymarket_bot/` import cleanly on Python 3.11 with requirements.txt;
  `btc_bot.py` correctly refuses to start without CB_API_KEY.

## Immediate next steps (in order)

1. Verify outbound access: `curl https://backboard.railway.app` and
   `https://api.polymarket.us` should connect (non-000 HTTP code). If they
   still 403 at the proxy, stop and tell the owner to fix the environment's
   network policy (see above) — nothing else on this list is possible.
2. Railway CLI is needed: `npm install -g @railway/cli`, then
   `railway login --browserless` and give the owner the pairing link.
   After login: link the project (`railway link`), check deploy status and
   logs (`railway logs`) for `Polymarket ... bot started (PAPER mode)`.
3. Help the owner add POLYMARKET_KEY_ID / POLYMARKET_SECRET_KEY as Railway
   variables (`railway variables set` or dashboard — the owner types the
   secret values, never paste them into chat).
4. Live-test the bot's data feed from the session (paper mode, read-only).

## House rules

- Never ask the owner to paste API secrets or private keys into chat.
- Never enable PM_LIVE yourself; the owner flips it after the paper gate.
- Commit work to a feature branch; `main` is what Railway deploys.
