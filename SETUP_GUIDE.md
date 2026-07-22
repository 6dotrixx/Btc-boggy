# Set up your own Kalshi trading bot — from zero

A step-by-step guide to running the same automated prediction-market bot from
scratch. No coding required — you'll create three free accounts, click deploy,
and paste in your keys. About **30 minutes** and **~$25**.

---

## ⚠️ Read this first (honest expectations)

- This bot trades on **Kalshi**, a US-regulated exchange. Automated trading via
  their API is allowed.
- **It is NOT guaranteed to make money.** The strategies are reasonable but
  *unproven* — you run them in **paper mode (fake money) first** to see if they
  actually work for you, then decide whether to risk real money.
- **You can lose your deposit.** Only use money you can afford to lose. Start
  with $25.
- This is not financial advice. You are responsible for your own account.

The bot is built to be *careful*: tiny position sizes, a daily loss stop, a
"canary" that makes your first real trades cost ~50¢, and it refuses trades it
can't price. It's designed to fail cheaply, not blow up.

---

## What it does

Two strategies run side by side:
1. **Arbitrage** — buys sets of outcomes that are mispriced to sum under $1
   (risk-free profit at the moment it fills). Rare, but free when it happens.
2. **Crypto fair-value** — prices Kalshi's hourly BTC/ETH/SOL/XRP/DOGE contracts
   against live Coinbase data and buys when Kalshi's price is clearly wrong.

A web dashboard shows you everything live and tells you when it's ready to go
live on its own.

---

## What you need

- A phone or computer
- ~$25 to deposit on Kalshi
- Three free accounts (below), created in this order

---

## Step 1 — Create three accounts

1. **GitHub** ([github.com](https://github.com)) — stores the code.
2. **Railway** ([railway.app](https://railway.app)) — runs the bot 24/7. Sign in
   *with your GitHub account* to link them.
3. **Kalshi** ([kalshi.com](https://kalshi.com)) — the exchange. Complete signup,
   **deposit $25**, and we'll make an API key in Step 5.

---

## Step 2 — Get your own copy of the code

On the bot's GitHub repo, click **Fork** (top right). This makes your own copy.

---

## Step 3 — Deploy it (this starts it in safe paper mode)

1. In Railway, click **New Project → Deploy from GitHub repo**.
2. Pick your forked repo. Railway reads the config and starts it automatically.
3. Wait ~2 minutes for it to build. **That's it — it's now running in paper
   mode** (simulated money, no keys needed yet).

---

## Step 4 — Open your dashboard

1. In Railway, click your service (**worker**) → **Settings** → scroll to
   **Networking** → **Generate Domain**.
2. Open the URL it gives you (like `something.up.railway.app`).

This is your live view — bot status, simulated profit, and a big banner that
turns **green when it's ready for real money.** Bookmark it.

---

## Step 5 — Add your Kalshi keys

1. On Kalshi: **Account → API Keys → Create New Key**. It shows a **Key ID** and
   downloads a **key file** — Kalshi only shows the file **once**, so keep it.
2. In Railway: **worker** service → **Variables** → **+ New Variable**. Add two:

| NAME (left box) | VALUE (right box) |
|---|---|
| `KALSHI_API_KEY_ID` | your Key ID (the long code) |
| `KALSHI_PRIVATE_KEY_PEM` | the entire text of the key file, `BEGIN`→`END` |

> **The #1 mistake:** the long key code is a **value**, not a name. Left box =
> the label exactly as written above; right box = your secret. Names are
> ALL_CAPS_WITH_UNDERSCORES.

3. Click **Deploy**. In a couple minutes your dashboard's crypto card will show
   `🔑 API keys VERIFIED — balance $25.00`. That confirms your key works and your
   deposit landed. (If it says `❌`, re-check the two values.)

Still paper mode — no real trades yet.

---

## Step 6 — Let it prove itself (2–3 days)

Watch the dashboard. It's collecting evidence on simulated trades. The banner
tells you plainly:
- ⏳ **Collecting data** — keep waiting
- ✅ **Ready for live** — the paper record cleared the bar
- ⚠️ **Edge not proven** — don't go live; it isn't working (yet)

**Don't skip this.** It costs nothing and it's the difference between deploying
something that works and gambling.

---

## Step 7 — Go live (when the banner is green)

Add two more variables in Railway → Deploy:

| NAME | VALUE |
|---|---|
| `PM_LIVE` | `1` |
| `PM_CRYPTO_LIVE` | `1` |

> Switches take the **number `1`** as their value — not a word, not another
> variable's name.

Now it trades real money. Your **first 5 trades are 1 contract each (~50¢)** to
prove everything works before it sizes up. From there: ~$1.25 max per crypto
trade, and it stops for the day after a 5% loss.

---

## The safety rails (already built in)

- **Canary:** first live trades are ~50¢ until the real order path is proven.
- **Per-trade cap** and **5% daily loss stop.**
- **Volatility ceiling:** skips coins too wild to price honestly.
- **Auto-unwind:** if only one leg of a trade fills, it sells back out; if it
  can't, it halts and tells you.
- **Exchange check:** pauses when Kalshi is closed or in maintenance.

---

## Reading your dashboard

- **Card is green + "running"** = that bot is alive.
- **fills** = how many trades it's made. `0` early on is normal — it's being
  picky, waiting for a real edge.
- **paper P&L / W-L** = the track record. This is what decides go-live.
- **Logs** (Railway → Deployments → View Logs) = the full play-by-play.

---

## If something's off

- **Dashboard won't load** → the service may be asleep or redeploying; open it
  again in a minute.
- **`❌ API keys` on the dashboard** → re-check the two Kalshi values; the most
  common cause is the key file text being incomplete (must include the
  `-----BEGIN-----` and `-----END-----` lines).
- **A coin shows "0 open markets"** → Kalshi may not list that coin; harmless,
  it's skipped.
- **Zero trades after going live** → normal if markets are efficient; the bot
  only buys on a real edge. You can lower `PM_CRYPTO_EDGE_CENTS` for more
  activity (and more risk).

---

*Trade responsibly. You can lose money. This is a tool, not a guarantee.*
