# Set up the Coinbase BTC bot — from zero

A step-by-step guide to running the automated Bitcoin trading bot. Like the
Kalshi guide, it starts in **paper mode (fake money)** so you can watch it work
before risking a cent. About **30 minutes** and **~$25** if you go live.

---

## ⚠️ Read this first — this one is riskier

The Kalshi bot has a risk-free arbitrage strategy. **This bot does not.** It's a
momentum bot: it buys Bitcoin when the trend looks strong and sells at a target
or a stop-loss. That means:

- **Every trade is a real bet on price direction.** There is no "locked-in
  profit" trade here — it can lose on any trade.
- Momentum strategies like this have **no guaranteed edge.** Plenty of days it
  will lose. That's why you run paper mode first.
- **You can lose your deposit.** Start with money you can afford to lose.
- Not financial advice. Your account, your risk.

The safety it *does* have: it only trades one position at a time, uses a fixed
dollar amount per trade, and exits on a stop-loss. And it starts in paper mode.

---

## What it does

On the 1-hour Bitcoin chart, it buys when **three signals agree** — a short-term
trend crosses above a longer one (EMA 9/21), momentum is strong (RSI > 55), and
the trend is real, not chop (ADX > 20). It takes profit at **+5%** or cuts losses
at **−2%**. It checks every few minutes, all day.

---

## What you need

- A phone or computer
- Three free accounts: **GitHub**, **Railway**, **Coinbase**
- ~$25 on Coinbase if/when you go live

*(If you already did the Kalshi guide, you have GitHub + Railway + the deploy
already — skip to Step 4.)*

---

## Step 1 — Create the accounts

1. **GitHub** ([github.com](https://github.com)) — stores the code.
2. **Railway** ([railway.app](https://railway.app)) — runs the bot 24/7. Sign in
   **with GitHub**.
3. **Coinbase** ([coinbase.com](https://coinbase.com)) — where the Bitcoin lives.
   You'll make an API key in Step 5.

---

## Step 2 — Fork the code

On the bot's GitHub page, click **Fork** to make your own copy.

---

## Step 3 — Deploy on Railway

**New Project → Deploy from GitHub repo →** pick your fork. Wait ~2 minutes.

---

## Step 4 — Turn the BTC bot on (in paper mode)

The BTC bot is off by default. To switch it on with **no keys and no risk**:

1. Railway → your **worker** service → **Variables** → **+ New Variable**
2. Add: **Name** `CB_ENABLE`  →  **Value** `1`
3. Deploy.

Now open your dashboard (Railway → **worker** → **Settings → Networking →
Generate Domain**). You'll see a **btc** card running in 📝 PAPER mode, trading
fake money on real Bitcoin prices.

---

## Step 5 — Watch paper mode (a few days)

Let it run. On the dashboard / logs you'll see it buy and sell on simulated
money, with a running **P&L** and **win/loss** count. This is your evidence:
does this strategy actually make money, or lose it? **Do not skip this.**

Honest note: momentum bots often look great in a trend and bleed in choppy
markets. A few days of paper results will show you which you're in.

---

## Step 6 — Go live (only if paper looks good)

1. On Coinbase: **Settings → API** (or Advanced Trade → API keys) → **Create
   key**. Give it **trade** permission. Copy the **API key** and **secret**.
2. In Railway → **worker** → **Variables**, add three:

| Name | Value |
|---|---|
| `CB_API_KEY` | your Coinbase API key |
| `CB_API_SECRET` | your Coinbase API secret |
| `CB_LIVE` | `1` |

3. Deploy. The dashboard's btc card will switch to 🔴 **LIVE**.

> Same rule as always: the switch `CB_LIVE` takes the **number `1`**. The key and
> secret are the long codes — they go in the **value** box, never the name box.

Optional tuning (values are dollars / percentages):
`TRADE_AMOUNT` (default `20`), `TAKE_PROFIT` (`0.05` = 5%), `STOP_LOSS` (`0.02` = 2%).

---

## Reading the dashboard

- **btc card = running** → the bot is alive; the mode line says PAPER or LIVE.
- **P&L** → simulated (paper) or real (live) profit so far.
- **W / L** → how many trades won vs lost. Momentum strategies often have more
  small losses than wins but bigger wins — watch the P&L, not just the count.
- Full detail: Railway → Deployments → **View Logs**.

---

## If something's off

- **No btc card** → you didn't set `CB_ENABLE=1` (paper) or the keys (live).
- **Card says PAPER after adding keys** → you also need `CB_LIVE=1`, and both
  keys must be present.
- **Errors after going live** → re-check the API key/secret values and that the
  Coinbase key has **trade** permission.

---

*This bot bets on price direction and can lose money. Paper-trade first, start
small, and only risk what you can afford to lose. Not financial advice.*
