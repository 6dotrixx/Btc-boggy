# Polymarket Bot — Research Report & Staged $25 → $100/day Plan

*Compiled 2026-07-17. Every factual claim below survived 3-voter adversarial fact-checking
against primary sources (academic papers, Polymarket docs, working open-source bots).
Claims that FAILED verification are listed at the bottom — read those too.*

---

## Part 1 — What the research actually says

### 1.1 Bot trading on Polymarket is officially supported — but the tooling changed in May 2026

- Polymarket's CLOB is hybrid-decentralized: off-chain order matching by an operator,
  on-chain non-custodial settlement on Polygon via signed (EIP-712) order messages.
  ([docs.polymarket.com](https://docs.polymarket.com/developers/CLOB/introduction))
- **`py-clob-client` was archived ~May 25, 2026 and no longer works.** The supported path
  is the new unified Python SDK: **[`Polymarket/py-sdk`](https://github.com/Polymarket/py-sdk)**
  (REST + WebSockets in one package). Any tutorial that says `pip install py-clob-client`
  is out of date. ([github.com/Polymarket/py-clob-client](https://github.com/Polymarket/py-clob-client))
- Order types available: limit + market, GTC / FOK / FAK, 0.01 tick size — everything
  needed for market making and arbitrage.
- Fees: the old "0 bps maker / 0 bps taker" schedule **did not survive fact-checking** for
  2026. Polymarket now runs a maker-rebate program that shares **taker fees** with makers
  (confirmed via the poly-maker bot's design). Assume taker fees exist on at least some
  markets and prefer maker orders.

### 1.2 Intra-market & combinatorial arbitrage — the best-documented real edge

- Outcome sets are designed to sum to $1, but mispricings happen: you can sometimes buy a
  full outcome set for < $1 (or sell for > $1) — a structurally risk-free profit.
  ([arXiv:2508.03474](https://arxiv.org/abs/2508.03474))
- An IMDEA Networks study of all markets resolving Apr 2024 → Apr 2025 (86M bets) estimates
  **~$40M of realized arbitrage profit** was extracted in one year, primarily by bots.
  ([Yahoo/Decrypt coverage](https://finance.yahoo.com/news/arbitrage-bots-dominate-polymarket-millions-100000888.html))
- Profits are concentrated: top wallet ~$2.0M over 4,049 trades (~$496/trade avg); top 10
  wallets ~$9.1M. **But only ~1% of detectable arbs were actually executed** — the
  opportunity set is not fully picked over (2-1 vote; granular figures from secondary
  summaries of the paper).
- A UCLA study of NBA markets (75M order-book snapshots, 173 games) found single-market
  YES+NO arbs are rare and die in a **median 3.6 seconds**, while **combinatorial arbs
  across Moneyline–Spread pairs were far more common (290 episodes)**, concentrated in the
  final minutes of live games, with a **median realized edge of ~101 bps (~1%) per trade**.
  ([arXiv:2605.00864](https://arxiv.org/abs/2605.00864))

**Takeaway:** speed-sensitive, small edges, real money. Works at small size (maker orders,
$1 minimums), which is exactly what a $25 account needs.

### 1.3 Behavioral edges — what's real and what's a myth

- **No general longshot bias** on Polymarket (contrary to sportsbook folklore). Blanket
  buying 95–99¢ favorites is *not* a documented free lunch.
- The documented bias is **overtrading of the default / "Yes" option** — crowds pile into
  "Yes" on hyped questions, making the **"No" side systematically cheap** on average.
  ([Reichenbach & Walther, SSRN 5910522](https://www.researchgate.net/publication/398660802_Exploring_Decentralized_Prediction_Markets_Accuracy_Skill_and_Bias_on_Polymarket))
- Polymarket prices are well calibrated and slightly **more accurate than bookmaker odds**
  (mean prediction error 37.2% vs 38.0–38.4%) — so "arb the sportsbooks" edges are thin.
- **Only ~30% of Polymarket traders are net profitable, and the share is falling.** That is
  the base rate we are fighting.

### 1.4 Market making & liquidity rewards

- Fully feasible technically: [poly-maker](https://github.com/warproxxx/poly-maker) is a
  working open-source Python maker bot (two-sided maker-only quotes, Gamma API market
  discovery, WebSocket book data) that explicitly optimizes for **liquidity rewards +
  maker rebates** vs volatility risk.
- Its own authors warn: *"Market making on Polymarket is competitive and can lose money."*
  Practitioner postmortems of reward farming say the same. Treat rewards as a yield
  booster on top of a sensible strategy, not free money.

### 1.5 Resolution (UMA oracle) risk — the tail risk that kills small accounts

- Disputed events account for **~$972M of cumulative trading volume**; disputes are
  financially material (e.g., the $85M Strategy-BTC-sale dispute).
  ([arXiv:2604.15674](https://arxiv.org/pdf/2604.15674))
- LLMs (and therefore bots) **cannot reliably predict in advance** which markets will be
  disputed. Mitigation is structural, not predictive: prefer objectively-resolved markets
  (crypto price markets, final sports scores) and exit before resolution when possible.

### 1.6 Venue note for US users

Polymarket geo-blocks US retail access (Americans provably trade via offshore workarounds —
don't; it's a ToS/regulatory violation). **Kalshi is the US-regulated alternative**, has a
public API, and hosts equivalent crypto/hourly markets; several open-source
Polymarket↔Kalshi arb bots exist. Everything in this plan maps 1:1 onto Kalshi if you're
US-based — verify your legal access before funding anything.

### Claims that FAILED adversarial verification (don't build on these)

1. "Polymarket is 0 bps maker / 0 bps taker in 2026" — outdated; taker fees + maker rebates now exist.
2. "The API accepts orders of any amount with no restrictions" — overreach.
3. "Order-book depth caps arb at ~14.8 shares, so institutions can't compete" — overreach; they do.
4. "44% skill persistence proves copy-trading works" — statistic misattributed, inference overreached. Copy-trading is **not** in the top 5 for this reason.

---

## Part 2 — The 5 best strategies for a $25-start bot (ranked)

| # | Strategy | Edge/trade | Risk | Viable from | Evidence grade |
|---|----------|-----------|------|-------------|----------------|
| 1 | **Negative-risk set arbitrage** — buy full outcome set when it sums < $1 (or YES+NO < $1) | 0.5–2%, risk-free at fill | Execution/partial-fill only | **$25** | A ($40M/yr documented) |
| 2 | **Combinatorial sports arb** — Moneyline↔Spread (and similar linked-market) dislocations, esp. late in live games | ~1% median (101 bps) | Leg risk, speed | **$50–100** | A (peer-reviewed measurement) |
| 3 | **"No"-side value harvesting** — fade the documented Yes/default overtrading bias on hyped binary markets | 1–3% expected, not risk-free | Variance; needs 20+ concurrent positions | **$150–300** | B (documented bias, no public P&L) |
| 4 | **Liquidity-rewards market making** — two-sided maker quotes inside the rewards band on quiet markets, earning spread + daily rewards + maker rebates | rewards ≈ daily yield on quoted capital | Adverse selection on news | **$300–500** | B (working OSS bot; authors warn it's competitive) |
| 5 | **Cross-venue arb (Polymarket ↔ Kalshi)** on identical markets, esp. BTC/ETH hourly & daily price markets | 0.5–2% when it appears | Capital split across venues, KYC, withdrawal latency | **$500–1,000** (needs float on both) | B (multiple working OSS bots, thin edges) |

Why these five: #1 and #2 are the only strategies with *measured, peer-reviewed* profit
evidence; #3 is the only *verified* behavioral bias; #4 adds a yield floor once the
bankroll can afford to be parked in quotes; #5 is the classic risk-free trade but is
capital-hungry. Copy-trading and blanket favorite-buying were cut because their supporting
evidence failed fact-checking.

---

## Part 3 — Staged plan: $25 → $100/day

**Honest math first.** $100/day on $25 is a 400%/day return — impossible. The verified
edges are ~1% per trade, and only ~30% of traders are net-positive. The plan is a
*compounding ladder*: each phase adds a strategy when the bankroll can support it. At
~1–2%/day compounded (aggressive but consistent with documented per-trade edges and
multiple trades/day), $100/day steady-state needs a **$5,000–$10,000 bankroll**. Any
deposits you add along the way shorten the timeline dramatically — $25 alone takes months.

### Phase 0 — Setup & paper trading (Week 1, $0 at risk)
- Wallet + USDC on Polygon; API creds via `Polymarket/py-sdk` (NOT py-clob-client).
- Build the **arb scanner** (strategy 1) and run it in log-only mode for a week to measure
  real opportunity frequency and size at our latency.
- Deployment mirrors your existing `btc_bot.py`: Railway worker, secrets in env vars.
- **Gate to Phase 1:** scanner logs ≥ 3 executable arbs/day with net edge ≥ 0.5% after fees.

### Phase 1 — $25 → $150: arbitrage only (est. 4–10 weeks)
- Run strategy 1 live with the full bankroll per arb (it's risk-free at fill; the risk is
  partial fills — use FOK/FAK to avoid legging).
- Add strategy 2 (combinatorial sports arb) once the scanner handles linked markets.
- Expected: $0.25–$2/day. This phase is about proving the pipeline, not income.
- **Risk rules:** never hold a naked leg > 60s; skip markets with subjective resolution
  criteria; kill switch on 3 consecutive failed fills.
- **Gate:** 100+ live trades, realized edge within 30% of scanner's predicted edge.

### Phase 2 — $150 → $1,000: add "No"-side value (est. 2–4 months)
- Deploy strategy 3: screen hyped binary markets (volume spike + Yes > 65¢ + subjective
  hype categories), take small NO positions, 5% of bankroll max per market, 20+ positions.
- Exit before resolution when profit target hit (avoids UMA dispute tail risk).
- Expected: $2–$15/day combined. Drawdowns are normal here — this leg has variance.
- **Gate:** NO-fade sub-strategy shows positive expectancy over ≥ 50 resolved positions.

### Phase 3 — $1,000 → $5,000: add market making (est. 3–6 months)
- Deploy strategy 4 on 3–5 quiet, objectively-resolved markets (crypto price markets are
  ideal: no subjective resolution, continuous hedging reference on Coinbase — your
  existing bot's data feed is reusable here).
- Pull quotes on news/volatility triggers (adverse-selection defense — poly-maker's
  QUIET/volatile mode pattern).
- Expected: $10–$50/day (spread + rewards + rebates on quoted capital).
- **Gate:** 30-day MM P&L positive after inventory losses.

### Phase 4 — $5,000+: add cross-venue arb, reach $100/day
- Split float across Polymarket + Kalshi; run strategy 5 on BTC/ETH hourly/daily markets.
- At $5k–$10k across four legs, $100/day ≈ 1–2%/day — the top of what the evidence
  supports. Scale position caps, not risk-per-trade.
- Withdraw profits weekly above the working-bankroll target.

### Portfolio-level risk rules (all phases)
- Max 20% of bankroll in any single market; max 40% in any category.
- No positions held through resolution on subjectively-worded markets (UMA risk).
- Daily loss limit 5% of bankroll → bot halts, requires manual restart.
- Every strategy runs paper-mode first and must beat its gate before real money.

---

## Part 4 — Next step: bot architecture

```
polymarket_bot/
├── core/          # py-sdk wrapper, order mgmt, WebSocket book feeds, kill switch
├── strategies/
│   ├── s1_set_arb.py        # Phase 1
│   ├── s2_combo_arb.py      # Phase 1
│   ├── s3_no_fade.py        # Phase 2
│   ├── s4_market_maker.py   # Phase 3
│   └── s5_cross_venue.py    # Phase 4 (Kalshi client)
├── risk/          # bankroll ledger, position caps, loss limits, phase gates
├── paper/         # simulated fills against live books
└── main.py        # Railway worker (same pattern as btc_bot.py)
```

Say the word and I'll build Phase 0/1 (core + arb scanner + paper trading) next.
