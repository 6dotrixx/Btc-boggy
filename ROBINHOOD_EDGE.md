# Robinhood Market Edge — research & playbook

Working doc for finding short-dated options plays ("banger plays") with the
Robinhood agentic account, modeled on the 2026-08-06 QQQ trade:
40x QQQ $717P 0DTE bought at $1.98 avg on the morning flush, sold at $3.26
into the bounce → +$5,110 realized (+64%). That trade was a morning-dip
mean-reversion play on the most liquid 0DTE product there is.

## Account reality check (as of 2026-08-06 evening)

| Account | Type | Options level | Agent access | Value |
|---|---|---|---|---|
| ••••1000 (default) | margin | Level 3 | NO — not agentic | (where the QQQ trade happened) |
| ••••0019 (Roth IRA) | margin | none | NO | — |
| ••••1317 "Agentic" | cash | Level 2 (long calls/puts) | **YES** | **$86.96 total, $47.96 cash** |

Consequences:
- The agent can only trade the Agentic account. A near-money QQQ 0DTE put
  (e.g. 8/7 $713P) marks ~$2.37 = **$237/contract — more than the whole
  account**. QQQ/SPY 0DTE is out of reach until the account is funded
  (~$500+ minimum to buy one contract with room for a stop).
- What fits $48 today: sub-$1 weeklies on cheap high-IV names
  (SOUN 8/7 $7C ~$0.22, $7P ~$0.15, $7.5C ~$0.06 at Wed close).
  These are lottery tickets; spreads and theta eat most of the edge.
- Cash account = no margin, and unsettled funds from a sale can't be
  re-spent same day without a limited-margin upgrade. Roughly one round
  trip per day at this size.

## Live scan (created via agent, saved on the account)

Scanner **"Edge: High options volume + IV"** (`scan_id
e54b9d8b-61a1-4bc0-bd0d-3af515e1d7c6`) — preset HIGH_OPTIONS_VOLUME_IV,
re-runnable any time with `run_scan`. Filtered for market cap > $2B and
price > $5, Wed 8/6 close standouts:

| Ticker | Move | Rel. options vol | IV | Setup type |
|---|---|---|---|---|
| TEAM | +31.6% | 4.3x | 90% | Post-earnings gap — day-2 continuation/fade |
| TWLO | +16.0% | 2.3x | 82% | Post-earnings gap — day-2 continuation/fade |
| TTD | −24.3% | 5.9x | 86% | Post-earnings crash — bounce or flush |
| AAOI | +7.0% | 2.7x | 143% | AI-optics momentum, very high IV |
| NBIS | +1.9% | 2.3x | 160% | Highest IV on the board |
| SOUN | flat | 7.3x | 97% | $7 stock, affordable weeklies |
| MARA / CLSK | flat | ~2.2–2.6x | ~100% | BTC beta, cheap stock price |
| SMR / RGTI / PTON | mixed | 2.2–2.5x | ~83–101% | High-IV cheap names |

## Catalysts — Fri 2026-08-07 session

Earnings (from Robinhood earnings calendar):
- Pre-market: **OKLO, VST, TTWO, FLR, FUBO, UA/UAA, WEN** — OKLO and VST
  are the big options movers; TTWO gaps hard on guidance.
- After close: SKX, BH, HE.
- Sat 8/8 am: BRK.B.

All 16 liquid candidates saved to Robinhood watchlist **🎯 Edge
Candidates** (QQQ + the scan/earnings names above).

## The playbook (what "find bangers like this" means, systematized)

The 8/6 QQQ winner was: liquid underlying + violent morning move +
mean-reversion entry near exhaustion + cutting the position within hours.
Repeatable version:

1. **Pre-open (8:00–9:25 ET):** run the saved scan; check earnings gaps
   >±5% on liquid names; note QQQ/SPY overnight range.
2. **Opening drive (9:30–10:00 ET):** no entries in the first 15 min.
   Mark the 15-min opening range on the target.
3. **Entry triggers:**
   - *Dip-reversal (the 8/6 trade):* fast flush ≥0.7% on QQQ that stalls
     (lower wicks, falling volume) → buy slightly-OTM same/next-day
     option in the bounce direction.
   - *Opening-range breakout:* break of the 15-min range with volume on
     an earnings-gap name → buy the direction of the break.
4. **Exits:** hard stop at −40% of premium; take 50–100% gains without
   negotiating; everything closed by ~15:30 ET (theta on 0-1DTE
   accelerates all afternoon; Robinhood force-sells 0DTE ~15:30-45 ET).
5. **Sizing:** risk ≤5% of account per play once funded. (The 8/6 trade
   risked ~$8k of premium — that only looks like sizing discipline
   because it won.)

*(Web-research findings on strategy content and current market context
are appended below.)*
