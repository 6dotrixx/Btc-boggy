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
EDGE_CENTS = float(os.environ.get("PM_CRYPTO_EDGE_CENTS", "4"))
RISK_FRAC = float(os.environ.get("PM_CRYPTO_RISK_FRAC", "0.05"))
DAILY_LOSS_FRAC = float(os.environ.get("PM_DAILY_LOSS_FRAC", "0.05"))
VOL_GUARD_RATIO = float(os.environ.get("PM_CRYPTO_VOL_GUARD", "1.8"))
# Absolute per-minute vol ceiling: above this the lognormal model is
# unreliable (jumpy alt in a pump), so skip it — "pumping, but safely".
MAX_VOL_1M = float(os.environ.get("PM_CRYPTO_MAX_VOL", "0.004"))
BOOK_PATH = os.environ.get("PM_CRYPTO_BOOK_PATH", "paper_book_crypto.json")

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


def _today():
    return datetime.now(timezone.utc).date().isoformat()


class PaperBook:
    """Directional positions (paper or live-mirrored), settled after close,
    with a daily loss kill-switch."""

    def __init__(self):
        self.state = {
            "bankroll": config.BANKROLL, "wins": 0, "losses": 0,
            "realized": 0.0, "open": [],
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

    def halted(self):
        """True when the daily loss limit has tripped (resets next UTC day)."""
        self._roll_day()
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

    if live or os.environ.get("PM_SELFTEST") == "1":
        from .selftest import run_preflight

        run_preflight(series=SERIES[0] if SERIES else "KXBTC",
                      authed=bool(os.environ.get("KALSHI_API_KEY_ID")), log=log)

    if live:
        from .canary import Canary

        canary = Canary("live_canary_crypto.json")
        balance = kalshi_api.get_balance()  # also validates credentials
        book.set_bankroll(balance)
        log(f"🔴 LIVE MODE — real orders; Kalshi balance ${balance:.2f}{canary.note()}")
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

    log(f"🔍 Kalshi crypto fair-value bot started ({'LIVE' if live else 'PAPER'} mode)")
    log(f"series={','.join(SERIES)} | edge>={EDGE_CENTS}c after fees | "
        f"window={MIN_MINUTES}-{MAX_MINUTES}m | risk/trade={RISK_FRAC:.0%} | "
        f"daily stop={DAILY_LOSS_FRAC:.0%} | vol guard x{VOL_GUARD_RATIO}")

    spots = {}

    def spot_lookup(ticker):
        for series, spot in spots.items():
            if series in ticker:
                return spot
        return None

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
                time.sleep(config.SCAN_INTERVAL)
                continue
            market_closed_logged = False
            if book.halted():
                if not halted_logged:
                    log(f"🛑 daily loss limit hit (day P&L ${book.state['day_pnl']:+.2f}) "
                        "— no new positions until next UTC day")
                    halted_logged = True
            else:
                halted_logged = False
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
