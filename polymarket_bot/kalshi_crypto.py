"""Fair-value stat-arb on Kalshi crypto interval markets (BTC/ETH price contracts).

A "BTC above $K at HH:00" contract is a binary option. Fair value from live
Coinbase data with zero drift:

    P(S_close > K) = Phi( ln(S / K) / (sigma_1m * sqrt(minutes_left)) )

where sigma_1m is realized per-minute volatility from recent 1-minute candles.
We buy YES when fair - ask - fee > threshold, NO when (1-fair) - ask - fee >
threshold. This strategy is DIRECTIONAL (win rate, not locked profit), so the
risk rails are strict:

- VOL GUARD: if short-window vol spikes vs the long window (news regime),
  the series is skipped entirely for that cycle, and pricing always uses the
  larger of the two vol estimates.
- DAILY KILL-SWITCH: if the day's realized P&L hits -PM_DAILY_LOSS_FRAC of
  the day's starting bankroll, no new positions until the next UTC day.
- One position per market, PM_CRYPTO_RISK_FRAC of bankroll per trade.
- Live requires BOTH PM_LIVE=1 and PM_CRYPTO_LIVE=1. In live mode the
  bankroll syncs from the real Kalshi balance and positions are recorded at
  the actually-filled contract count.
"""

import json
import math
import os
import re
import time
from datetime import datetime, timezone

import requests

from . import config, kalshi_api

COINBASE = "https://api.exchange.coinbase.com"
SERIES = [
    s.strip()
    for s in os.environ.get(
        "PM_CRYPTO_SERIES",
        # BTC/ETH are confirmed live. The rest are candidates: any series
        # Kalshi doesn't actually list returns 0 markets and is skipped
        # harmlessly (the heartbeat shows which are real).
        "KXBTC,KXBTCD,KXETH,KXETHD,KXSOL,KXSOLD,KXXRP,KXXRPD,KXDOGE,KXDOGED",
    ).split(",")
    if s.strip()
]
MIN_MINUTES = float(os.environ.get("PM_CRYPTO_MIN_MINUTES", "3"))
MAX_MINUTES = float(os.environ.get("PM_CRYPTO_MAX_MINUTES", "240"))
# Min model edge (cents, after fees) before a fair-value trade. Dialed in via
# scripts/dial_in_edge.py: below ~6c the bot trades on its own model noise and
# loses to the spread+fee; a high bar means it only acts on strong, real
# mispricings (rare, but the only trades that aren't -EV). Protects capital.
EDGE_CENTS = float(os.environ.get("PM_CRYPTO_EDGE_CENTS", "6"))
# Hard lifetime loss cap: once cumulative realized loss reaches this many
# dollars, the bot stops opening positions for good. Protects a small stake.
MAX_TOTAL_LOSS = float(os.environ.get("PM_MAX_TOTAL_LOSS", "5"))
RISK_FRAC = float(os.environ.get("PM_CRYPTO_RISK_FRAC", "0.05"))
DAILY_LOSS_FRAC = float(os.environ.get("PM_DAILY_LOSS_FRAC", "0.05"))
VOL_GUARD_RATIO = float(os.environ.get("PM_CRYPTO_VOL_GUARD", "1.8"))
# Absolute per-minute vol ceiling: above this the lognormal model is
# unreliable (jumpy alt in a pump), so skip it — "pumping, but safely".
MAX_VOL_1M = float(os.environ.get("PM_CRYPTO_MAX_VOL", "0.004"))
BOOK_PATH = os.environ.get("PM_CRYPTO_BOOK_PATH", "paper_book_crypto.json")

# ── Active mode ──────────────────────────────────────────────────────────────
# Reflex-style: place a small directional wager every PM_WAGER_MINUTES on the
# nearest-the-money crypto contract, picking the side by short-term momentum,
# and hold to settlement. This does NOT wait for a modeled edge — it's active
# betting, protected only by the caps (per-wager size, max open, daily stop,
# and the hard PM_MAX_TOTAL_LOSS floor).
#
# Resolution: OFF by default, everywhere. Active momentum-betting every 15 min
# is NEGATIVE expected value — scripts/paper_sim_50.py shows ~-4c/trade and only
# 33% of 50-trade runs finish positive (it's a coin flip minus the fee). So it
# must never run unless you explicitly opt in with PM_CRYPTO_ACTIVE (parsed
# leniently: "1"/"true"/"yes"/"on" → ON). The disciplined fair-value + arbitrage
# path is the default because it's the only one that isn't structurally -EV.
_active_env = os.environ.get("PM_CRYPTO_ACTIVE")
ACTIVE = bool(_active_env) and _active_env.strip().lower() in ("1", "true", "yes", "on")
WAGER_MINUTES = float(os.environ.get("PM_WAGER_MINUTES", "15"))
WAGER_DOLLARS = float(os.environ.get("PM_WAGER_DOLLARS", "1"))
MAX_OPEN = int(os.environ.get("PM_MAX_OPEN", "3"))
# Cents to bid through the ask on a live wager so the IOC actually crosses.
WAGER_SLIP_CENTS = int(os.environ.get("PM_WAGER_SLIP_CENTS", "2"))

session = requests.Session()
session.headers["User-Agent"] = "btc-boggy-kalshi-crypto/0.3"

# Kalshi series ticker -> Coinbase spot product. Only coins with a liquid
# Coinbase USD feed (needed for fair value) are eligible.
COIN_SYMBOLS = ("BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "LTC", "DOT")


def product_for(series_ticker):
    t = series_ticker.upper()
    # Longest symbols first so e.g. "LINK" isn't shadowed by a shorter match.
    for sym in sorted(COIN_SYMBOLS, key=len, reverse=True):
        if sym in t:
            return f"{sym}-USD"
    return None


def candles(product, minutes=90):
    """Recent 1-minute closes, oldest first."""
    resp = session.get(
        f"{COINBASE}/products/{product}/candles",
        params={"granularity": 60},
        timeout=10,
    )
    resp.raise_for_status()
    rows = sorted(resp.json(), key=lambda r: r[0])[-minutes:]
    return [float(r[4]) for r in rows]


def realized_vol_1m(closes, min_n=20):
    rets = [math.log(b / a) for a, b in zip(closes, closes[1:]) if a > 0]
    if len(rets) < min_n:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var)


def vol_regime(closes):
    """(sigma_to_use, spiking) — conservative vol + news-spike detection."""
    long = realized_vol_1m(closes)
    short = realized_vol_1m(closes[-20:], min_n=10)
    if long is None:
        return None, False
    if short is None:
        return long, False
    spiking = long > 0 and (short / long) > VOL_GUARD_RATIO
    return max(long, short), spiking


def fair_yes_prob(spot, strike, sigma_1m, minutes_left):
    """P(close above strike), zero-drift lognormal."""
    if min(spot, strike, minutes_left) <= 0 or not sigma_1m:
        return None
    denom = sigma_1m * math.sqrt(minutes_left)
    if denom <= 0:
        return None
    d = math.log(spot / strike) / denom
    return 0.5 * (1.0 + math.erf(d / math.sqrt(2)))


def parse_strike(market):
    for k in ("floor_strike", "cap_strike", "strike"):
        v = market.get(k)
        if v:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    m = re.search(r"-[TB](\d+(?:\.\d+)?)$", market.get("ticker", ""))
    return float(m.group(1)) if m else None


def minutes_to_close(market, now=None):
    ct = market.get("close_time")
    if not ct:
        return None
    try:
        close = datetime.fromisoformat(ct.replace("Z", "+00:00"))
    except ValueError:
        return None
    now = now or datetime.now(timezone.utc)
    return (close - now).total_seconds() / 60.0


def evaluate(market, spot, sigma_1m, now=None):
    """Return a trade signal dict or None."""
    mins = minutes_to_close(market, now)
    if mins is None or not (MIN_MINUTES <= mins <= MAX_MINUTES):
        return None
    strike = parse_strike(market)
    if not strike:
        return None
    fair = fair_yes_prob(spot, strike, sigma_1m, mins)
    if fair is None:
        return None

    yes_ask, no_ask = market.get("yes_ask") or 0, market.get("no_ask") or 0
    for side, ask, fv in (("yes", yes_ask, fair), ("no", no_ask, 1.0 - fair)):
        if not (1 <= ask <= 99):
            continue
        edge = fv * 100 - ask - kalshi_api.taker_fee_cents(ask)
        if edge >= EDGE_CENTS:
            return {
                "ticker": market["ticker"],
                "side": side,
                "ask": ask,
                "fair": round(fv * 100, 1),
                "edge": round(edge, 1),
                "strike": strike,
                "spot": spot,
                "minutes": round(mins, 1),
                "close_time": market.get("close_time"),
            }
    return None


def evaluate_active(markets, spot, closes, book):
    """Active-mode wager: among contracts in the trade window, walk outward
    from the money and take the FIRST one that actually has a tradeable quote,
    betting the direction of recent momentum. No modeled edge required.

    The nearest-the-money strike frequently has no resting offer on Kalshi, so
    picking only the single closest market (and giving up if it's unquoted)
    means never trading even when plenty of liquid contracts exist. Walking
    outward fixes that.
    """
    ref = closes[-16] if len(closes) >= 16 else closes[0]
    up = closes[-1] >= ref
    eligible = []
    for m in markets:
        if book.has_open(m.get("ticker", "")):
            continue
        mins = minutes_to_close(m)
        if mins is None or not (MIN_MINUTES <= mins <= MAX_MINUTES):
            continue
        strike = parse_strike(m)
        if not strike:
            continue
        eligible.append((abs(spot - strike), strike, m))
    eligible.sort(key=lambda e: e[0])
    for _dist, strike, m in eligible:
        # Prefer the momentum side; fall back to the other if its book is empty.
        for side in (("yes", "no") if up else ("no", "yes")):
            ask = (m.get("yes_ask") if side == "yes" else m.get("no_ask")) or 0
            if 1 <= ask <= 99:
                return {
                    "ticker": m["ticker"], "side": side, "ask": int(ask),
                    "strike": strike, "spot": spot,
                    "close_time": m.get("close_time"),
                    "momentum": "up" if up else "down",
                }
    return None


def _today():
    return datetime.now(timezone.utc).date().isoformat()


class PaperBook:
    """Directional positions (paper or live-mirrored), settled after close,
    with a daily loss kill-switch."""

    def __init__(self):
        self.state = {
            "bankroll": config.BANKROLL, "wins": 0, "losses": 0,
            "realized": 0.0, "open": [],
            # "fills" = positions actually opened (visible the instant a wager
            # lands, before it settles). "last_trade" = human-readable summary
            # of the most recent open so the dashboard can show live activity.
            "fills": 0, "last_trade": "",
            "day": _today(), "day_start_bankroll": config.BANKROLL, "day_pnl": 0.0,
        }
        if os.path.exists(BOOK_PATH):
            try:
                with open(BOOK_PATH) as f:
                    self.state.update(json.load(f))
            except (OSError, ValueError):
                pass
        self._roll_day()

    def _save(self):
        try:
            with open(BOOK_PATH, "w") as f:
                json.dump(self.state, f, indent=1)
        except OSError:
            pass

    def _roll_day(self):
        if self.state.get("day") != _today():
            self.state["day"] = _today()
            self.state["day_start_bankroll"] = self.state["bankroll"]
            self.state["day_pnl"] = 0.0
            self._save()

    def set_bankroll(self, dollars):
        self.state["bankroll"] = dollars
        self._save()

    def set_status(self, msg):
        """Publish a one-line, plain-English reason for what the bot is doing
        right now, so the dashboard can show why it is (or isn't) wagering
        without anyone reading the logs."""
        if self.state.get("status") != msg:
            self.state["status"] = msg
            self._save()

    def enter_mode(self, mode):
        """Ensure the loss/settlement counters belong to the current mode.

        The same ledger file is reused across restarts, but paper and live
        P&L must never mix: a simulated paper drawdown must not trip the
        real-money hard-loss cap (and vice-versa). The first time we run in a
        new mode, start that mode's track record clean while keeping the
        (real) bankroll that was just synced. Open positions are dropped —
        they belong to the previous mode and can't be settled honestly here.

        Returns True if a reset happened.
        """
        if self.state.get("mode") == mode:
            return False
        self.state["mode"] = mode
        self.state.update({
            "wins": 0, "losses": 0, "realized": 0.0, "open": [],
            "fills": 0, "last_trade": "",
            "day": _today(), "day_start_bankroll": self.state["bankroll"],
            "day_pnl": 0.0,
        })
        self._save()
        return True

    def total_loss_hit(self):
        """True once cumulative realized loss reaches the hard lifetime cap."""
        return MAX_TOTAL_LOSS > 0 and self.state["realized"] <= -MAX_TOTAL_LOSS

    def halted(self):
        """True when trading should stop. In active mode the hard total-loss
        cap is the only limit (so it keeps wagering up to that cap); otherwise
        the daily fractional stop also applies."""
        self._roll_day()
        if self.total_loss_hit():
            return True
        if ACTIVE:
            return False  # active mode governed solely by PM_MAX_TOTAL_LOSS
        limit = DAILY_LOSS_FRAC * max(self.state["day_start_bankroll"], 0.01)
        return self.state["day_pnl"] <= -limit

    def has_open(self, ticker):
        return any(p["ticker"] == ticker for p in self.state["open"])

    def size_for(self, sig):
        budget = self.state["bankroll"] * RISK_FRAC
        return int(budget * 100 // sig["ask"])

    def record(self, sig, contracts, live=False):
        if contracts < 1:
            return None
        cost = contracts * sig["ask"] / 100.0
        pos = {**sig, "contracts": contracts, "cost": round(cost, 4), "live": live,
               "opened": datetime.now(timezone.utc).isoformat()}
        self.state["open"].append(pos)
        # Count the position the instant it opens so the dashboard reflects
        # activity immediately, not only after the contract settles.
        self.state["fills"] = self.state.get("fills", 0) + 1
        self.state["last_trade"] = (
            f"{'LIVE' if live else 'paper'} {sig['side'].upper()} {sig['ticker']} "
            f"{contracts}x @ {sig['ask']}c (${cost:.2f})")
        self._save()
        return pos

    def settle(self, spot_lookup):
        """Settle positions whose market has closed. spot_lookup(ticker)->spot."""
        now = datetime.now(timezone.utc)
        results, still_open = [], []
        for p in self.state["open"]:
            try:
                close = datetime.fromisoformat(p["close_time"].replace("Z", "+00:00"))
            except (KeyError, ValueError, AttributeError):
                still_open.append(p)
                continue
            if now < close:
                still_open.append(p)
                continue
            spot = spot_lookup(p["ticker"])
            if spot is None:
                still_open.append(p)
                continue
            above = spot > p["strike"]
            won = above if p["side"] == "yes" else not above
            fee = kalshi_api.taker_fee_cents(p["ask"], p["contracts"]) / 100.0
            pnl = (p["contracts"] * 1.0 - p["cost"] - fee) if won else (-p["cost"] - fee)
            self.state["realized"] += pnl
            self.state["bankroll"] += pnl
            self.state["day_pnl"] += pnl
            self.state["wins" if won else "losses"] += 1
            results.append({**p, "won": won, "pnl": round(pnl, 4), "settle_spot": spot})
        self.state["open"] = still_open
        self._roll_day()
        self._save()
        return results


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def main():
    live = config.LIVE and os.environ.get("PM_CRYPTO_LIVE") == "1"
    book = PaperBook()
    canary = None

    # Loud, unmistakable startup banner: the first thing in the logs states the
    # exact effective setup, so it's instantly clear whether real-money active
    # wagering is armed — no digging required.
    _keys = bool(os.environ.get("KALSHI_API_KEY_ID") and os.environ.get("KALSHI_PRIVATE_KEY_PEM"))
    log("══════════════════════════════════════════════════════════")
    log(f"  Kalshi crypto bot • {'🔴 LIVE (real money)' if live else '📝 PAPER'} • "
        f"{'🎲 ACTIVE wagering ON' if ACTIVE else '🧮 fair-value only'}")
    log(f"  keys set: {'yes' if _keys else 'NO'} | wager ~${WAGER_DOLLARS:.2f} every "
        f"{WAGER_MINUTES:.0f} min | hard loss cap ${MAX_TOTAL_LOSS:.2f}")
    if live and ACTIVE and _keys:
        log("  → armed: will place the first real wager within one cycle")
    elif live and not _keys:
        log("  → LIVE on but KEYS MISSING — set KALSHI_API_KEY_ID / KALSHI_PRIVATE_KEY_PEM")
    log("══════════════════════════════════════════════════════════")

    if live or os.environ.get("PM_SELFTEST") == "1":
        from .selftest import run_preflight

        run_preflight(series=SERIES[0] if SERIES else "KXBTC",
                      authed=bool(os.environ.get("KALSHI_API_KEY_ID")), log=log)

    live_synced = False
    if live:
        from .canary import Canary

        canary = Canary("live_canary_crypto.json")
        # Clear any inherited paper P&L up front so it can never trip the
        # real-money loss cap — do this even if the balance fetch below fails.
        if book.enter_mode("live"):
            log("🧹 fresh LIVE ledger — prior paper P&L discarded so it can't "
                "trip the real-money loss cap")
        # Sync the real balance / validate credentials, with retries. A failure
        # here means orders can't be placed, so make it loud and visible rather
        # than crashing or silently degrading.
        balance = None
        for attempt in range(1, 4):
            try:
                balance = kalshi_api.get_balance()
                break
            except Exception as e:
                log(f"⚠️ Kalshi connect/auth attempt {attempt}/3 failed: {e}")
                time.sleep(2)
        if balance is not None:
            book.set_bankroll(balance)
            live_synced = True
            log(f"🔴 LIVE MODE — real orders; Kalshi balance ${balance:.2f}{canary.note()}")
        else:
            book.set_status("🔴 LIVE but CAN'T CONNECT to Kalshi to authenticate — orders "
                            "paused. Check KALSHI_API_KEY_ID / KALSHI_PRIVATE_KEY_PEM. Retrying…")
            log("❌ LIVE MODE but Kalshi auth/connect FAILED. Orders can't be placed until "
                "this clears — will keep retrying each cycle. Most common cause: "
                "KALSHI_PRIVATE_KEY_PEM pasted with literal \\n instead of real line breaks, "
                "or a wrong/rotated KALSHI_API_KEY_ID.")
    elif os.environ.get("KALSHI_API_KEY_ID"):
        # Paper mode doesn't use credentials, but verify them now so a typo
        # is caught on the dashboard long before go-live.
        try:
            balance = kalshi_api.get_balance()
            log(f"🔑 API keys VERIFIED — Kalshi balance ${balance:.2f} "
                "(still PAPER mode; not trading real funds)")
        except Exception as e:
            log(f"❌ API key check FAILED: {e} — fix KALSHI_API_KEY_ID / "
                "KALSHI_PRIVATE_KEY_PEM in Railway Variables before going live")

    if not live:
        book.enter_mode("paper")

    log(f"🔍 Kalshi crypto {'ACTIVE-WAGER' if ACTIVE else 'fair-value'} bot started "
        f"({'LIVE' if live else 'PAPER'} mode)")
    if ACTIVE:
        log(f"🎲 ACTIVE MODE — wager every {WAGER_MINUTES:.0f} min (~${WAGER_DOLLARS:.2f} each), "
            f"max {MAX_OPEN} open | daily stop={DAILY_LOSS_FRAC:.0%} | "
            f"HARD CAP: stops for good at ${MAX_TOTAL_LOSS:.2f} total loss")
    else:
        log(f"series={','.join(SERIES)} | edge>={EDGE_CENTS}c after fees | "
            f"window={MIN_MINUTES}-{MAX_MINUTES}m | risk/trade={RISK_FRAC:.0%} | "
            f"daily stop={DAILY_LOSS_FRAC:.0%} | vol guard x{VOL_GUARD_RATIO}")

    spots = {}

    def spot_lookup(ticker):
        for series, spot in spots.items():
            if series in ticker:
                return spot
        return None

    def buy(sig, contracts, tag):
        """Execute a buy (live or paper) and record it. Returns the position."""
        if contracts < 1:
            return None
        if live:
            contracts = canary.cap(contracts)
            # Bid a few cents through the ask so the IOC crosses even if the
            # book moved since the quote. Kalshi fills at the resting offer
            # price (≤ our limit), so this only improves fill odds, not cost.
            limit = min(99, sig["ask"] + WAGER_SLIP_CENTS)
            try:
                order = kalshi_api.create_order(
                    sig["ticker"], sig["side"], "buy", contracts, limit, ioc=True)
            except Exception as e:
                log(f"   ❌ order rejected by Kalshi: {e}")
                book.set_status(f"⚠️ Kalshi rejected the order: {e} — retrying next cycle")
                return None
            remaining = order.get("remaining_count")
            filled = (contracts - int(remaining) if remaining is not None
                      else (contracts if order.get("status") == "executed" else 0))
            if filled < 1:
                log("   ⚠️ IOC order did not fill")
                return None
            canary.record()
            pos = book.record(sig, filled, live=True)
            log(f"   ✅ LIVE {tag}: {filled}x @ {sig['ask']}c (${pos['cost']:.2f})")
            return pos
        pos = book.record(sig, contracts)
        log(f"   📝 paper {tag}: {contracts}x @ {sig['ask']}c (${pos['cost']:.2f})")
        return pos

    last_wager = 0.0
    halted_logged = False
    market_closed_logged = False
    cycle = 0
    while True:
        cycle += 1
        heartbeat = cycle % 10 == 1  # detailed line every ~5 min
        try:
            if not kalshi_api.trading_open():
                if not market_closed_logged:
                    log("⏸ exchange closed / maintenance — pausing until trading resumes")
                    market_closed_logged = True
                book.set_status("⏸ Kalshi exchange in maintenance/closed — will resume "
                                "automatically when it reopens")
                time.sleep(config.SCAN_INTERVAL)
                continue
            market_closed_logged = False
            # If live but we never authenticated to Kalshi, keep retrying and
            # do NOT attempt orders until it clears (an order would just error).
            if live and not live_synced:
                try:
                    bal = kalshi_api.get_balance()
                    book.set_bankroll(bal)
                    live_synced = True
                    log(f"🔴 connected to Kalshi — balance ${bal:.2f}; live orders now active")
                except Exception as e:
                    if heartbeat:
                        log(f"⚠️ still can't reach/authenticate Kalshi: {e} — orders paused")
                    book.set_status("🔴 LIVE but can't authenticate to Kalshi — orders paused; "
                                    "retrying (check KALSHI_API_KEY_ID / KALSHI_PRIVATE_KEY_PEM)")
                    time.sleep(config.SCAN_INTERVAL)
                    continue
            if book.halted():
                if not halted_logged:
                    if book.total_loss_hit():
                        log(f"🛑 HARD STOP — total loss cap ${MAX_TOTAL_LOSS:.2f} reached "
                            f"(realized ${book.state['realized']:+.2f}). No further trades.")
                    else:
                        log(f"🛑 daily loss limit hit (day P&L ${book.state['day_pnl']:+.2f}) "
                            "— no new positions until next UTC day")
                    halted_logged = True
                if book.total_loss_hit():
                    book.set_status(f"🛑 stopped for good — hit the ${MAX_TOTAL_LOSS:.2f} "
                                    f"real-money loss cap (P&L ${book.state['realized']:+.2f})")
                else:
                    book.set_status(f"🛑 daily loss stop hit (day ${book.state['day_pnl']:+.2f}) "
                                    "— resumes next UTC day")
            else:
                halted_logged = False
                primary = None
                candidates = []
                for series in SERIES:
                    product = product_for(series)
                    if not product:
                        continue
                    closes = candles(product)
                    if not closes:
                        continue
                    spot = closes[-1]
                    spots[series] = spot
                    sigma, spiking = vol_regime(closes)
                    if sigma is None:
                        continue
                    if spiking:
                        log(f"⚡ vol spike on {product} — skipping {series} this cycle")
                        continue
                    if sigma > MAX_VOL_1M:
                        if heartbeat:
                            log(f"🌪 {product} vol {sigma*100:.3f}%/min above ceiling "
                                f"{MAX_VOL_1M*100:.3f}% — skipping {series} (model unreliable)")
                        continue
                    markets = kalshi_api.get_markets(series)
                    if markets:
                        candidates.append((markets, spot, closes))
                        if primary is None:
                            primary = (markets, spot, closes)
                    if heartbeat:
                        if markets:
                            in_window = sum(
                                1 for m in markets
                                if (lambda t: t is not None and MIN_MINUTES <= t <= MAX_MINUTES)(
                                    minutes_to_close(m)
                                )
                            )
                            log(f"❤️ {series}: {len(markets)} open markets "
                                f"({in_window} in trade window) | spot={spot:.0f} "
                                f"sigma={sigma*100:.3f}%/min")
                        else:
                            log(f"⚠️ {series}: 0 open markets — series ticker may be "
                                "wrong; check kalshi.com/markets/crypto for the real "
                                "series name and set PM_CRYPTO_SERIES")
                    for market in markets:
                        if book.has_open(market.get("ticker", "")):
                            continue
                        sig = evaluate(market, spot, sigma)
                        if not sig:
                            continue
                        log(f"💡 {sig['side'].upper()} {sig['ticker']} ask={sig['ask']}c "
                            f"fair={sig['fair']}c edge={sig['edge']}c "
                            f"(spot={sig['spot']:.0f} K={sig['strike']:.0f} "
                            f"{sig['minutes']}m left)")
                        contracts = book.size_for(sig)
                        if contracts < 1:
                            continue
                        if live:
                            contracts = canary.cap(contracts)  # 1-contract early trades
                            order = kalshi_api.create_order(
                                sig["ticker"], sig["side"], "buy",
                                contracts, sig["ask"], ioc=True,
                            )
                            remaining = order.get("remaining_count")
                            filled = (
                                contracts - int(remaining)
                                if remaining is not None
                                else (contracts if order.get("status") == "executed" else 0)
                            )
                            if filled < 1:
                                log("   ⚠️ IOC order did not fill")
                                continue
                            canary.record()
                            pos = book.record(sig, filled, live=True)
                            log(f"   ✅ LIVE fill: {filled}x @ {sig['ask']}c "
                                f"(${pos['cost']:.2f})")
                        else:
                            pos = book.record(sig, contracts)
                            log(f"   📝 paper position: {contracts}x @ {sig['ask']}c "
                                f"(${pos['cost']:.2f})")

                if not ACTIVE:
                    # Make it unmistakable on the dashboard when the every-15-min
                    # wagering isn't switched on — the usual reason for "it never
                    # trades": PM_CRYPTO_ACTIVE isn't set to 1.
                    book.set_status("ℹ️ FAIR-VALUE mode — only trades on a rare modeled edge. "
                                    "To bet every 15 min, set Railway var PM_CRYPTO_ACTIVE=1")
                else:
                    open_n = len(book.state["open"])
                    wait_s = WAGER_MINUTES * 60 - (time.time() - last_wager)
                    if not candidates:
                        book.set_status("🔍 no crypto markets in the "
                                        f"{MIN_MINUTES:.0f}–{MAX_MINUTES:.0f}m window right now "
                                        "(quiet hour) — checking every 30s")
                    elif open_n >= MAX_OPEN:
                        book.set_status(f"⏳ holding {open_n} open wagers (max {MAX_OPEN}) — "
                                        "waiting for one to settle before the next")
                    elif wait_s > 0:
                        book.set_status(f"⏱ next wager in ~{int(wait_s // 60)}m "
                                        f"({open_n} open, live)")
                    else:
                        book.set_status("🎲 placing a wager now…")

                if ACTIVE and candidates and len(book.state["open"]) < MAX_OPEN \
                        and (time.time() - last_wager) >= WAGER_MINUTES * 60:
                    wsig = None
                    for mk, sp, cl in candidates:  # try every coin until one is tradeable
                        wsig = evaluate_active(mk, sp, cl, book)
                        if wsig:
                            break
                    if wsig:
                        aff = int(book.state["bankroll"] * 100 / wsig["ask"]) if wsig["ask"] else 0
                        contracts = min(max(1, int(WAGER_DOLLARS * 100 / wsig["ask"])), aff)
                        log(f"🎲 WAGER {wsig['side'].upper()} {wsig['ticker']} @ {wsig['ask']}c "
                            f"(momentum {wsig['momentum']}, spot={wsig['spot']:.0f} "
                            f"K={wsig['strike']:.0f})")
                        if buy(wsig, contracts, "wager"):
                            last_wager = time.time()
                    else:
                        book.set_status("🔍 markets open but no priceable contract near the "
                                        "money this cycle — retrying")

            for r in book.settle(spot_lookup):
                emoji = "✅" if r["won"] else "❌"
                log(f"{emoji} settled {r['ticker']} {r['side'].upper()}: "
                    f"{'WON' if r['won'] else 'LOST'} {r['pnl']:+.4f} "
                    f"(bankroll=${book.state['bankroll']:.2f} "
                    f"day={book.state['day_pnl']:+.2f} "
                    f"W:{book.state['wins']} L:{book.state['losses']})")
        except Exception as e:
            log(f"⚠️ scan error: {e} — retrying next cycle")

        time.sleep(config.SCAN_INTERVAL)


if __name__ == "__main__":
    main()
