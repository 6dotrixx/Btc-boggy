# Btc-boggy — project notes for Claude

Two trading bots deploy from `main` to a single Railway service
(`railway.toml` → `python run_all.py`):

- `btc_bot.py` — Coinbase BTC bot (EMA/RSI/ADX). Runs only if CB_API_KEY is set.
- `polymarket_bot/` — prediction-market set-arbitrage bot, three venues
  behind one loop (PM_VENUE=us|kalshi|crypto): Polymarket US (regulated,
  polymarket-us SDK, POLYMARKET_KEY_ID/POLYMARKET_SECRET_KEY), Kalshi
  (regulated, signed REST, KALSHI_API_KEY_ID/KALSHI_PRIVATE_KEY_PEM, taker
  fees priced into the scanner), and Polymarket crypto CLOB. Paper mode by
  default. run_all.py starts the Polymarket AND Kalshi bots side by side
  with separate paper ledgers; owner runs $25 per venue. Strategy, research
  findings, and the staged $25→$100/day plan are in POLYMARKET_PLAN.md.

## State as of 2026-07-17

- All code merged to `main` and pushed; Railway should be running it.
  Feature branch: `claude/polymarket-bot-strategies-tn3pn3`.
- Live trading is gated: PM_LIVE=1 + credentials + PM_MAX_PER_TRADE (keep 25).
  Owner has agreed to run PAPER MODE FIRST and review results before going live
  (gate: ≥3 arbs/day at ≥0.5% net edge in the logs).
- The previous session's environment blocked railway.app and polymarket
  domains; the owner has since opened network access, so a fresh session can
  reach them.

## Immediate next steps (in order)

1. Verify outbound access: `curl https://backboard.railway.app` and
   `https://api.polymarket.us` should connect.
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
