"""Fair-value stat-arb on Kalshi crypto interval markets (BTC/ETH price contracts).

A "BTC above $K at HH:00" contract is a binary option. Fair value from live
Coinbase data with zero drift:

    P(S_close > K) = Phi( ln(S / K) / (sigma_1m * sqrt(minutes_left)) )

where sigma_1m is realized per-minute volatility from recent 1-minute candles.
We buy YES when fair - ask - fee > threshold, NO when (1-fair) - ask - fee >
threshold. Unlike the set-arb strategies this is DIRECTIONAL (win rate, not
locked profit), so:

- paper mode by default, with positions settled against spot at close
- live requires BOTH PM_LIVE=1 and PM_CRYPTO_LIVE=1
- at most one open position per market, sized PM_CRYPTO_RISK_FRAC of bankroll

The counterparty flow here is largely rule-based automation (timed entries,
fixed TP/SL) with no pricing model — the whole point is to be the side that
has one.
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
        "PM_CRYPTO_SERIES", "KXBTC,KXBTCD,KXETH,KXETHD"
    ).split(",")
    if s.strip()
]
# Trade only inside this window before close (minutes).
MIN_MINUTES = float(os.environ.get("PM_CRYPTO_MIN_MINUTES", "3"))
MAX_MINUTES = float(os.environ.get("PM_CRYPTO_MAX_MINUTES", "240"))
# Required model edge in cents, after taker fee.
EDGE_CENTS = float(os.environ.get("PM_CRYPTO_EDGE_CENTS", "4"))
RISK_FRAC = float(os.environ.get("PM_CRYPTO_RISK_FRAC", "0.05"))
BOOK_PATH = os.environ.get("PM_CRYPTO_BOOK_PATH", "paper_book_crypto.json")

session = requests.Session()
session.headers["User-Agent"] = "btc-boggy-kalshi-crypto/0.1"


def product_for(series_ticker):
    for sym in ("BTC", "ETH", "SOL", "XRP"):
        if sym in series_ticker.upper():
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


def realized_vol_1m(closes):
    rets = [math.log(b / a) for a, b in zip(closes, closes[1:]) if a > 0]
    if len(rets) < 20:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var)


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


class PaperBook:
    """Directional paper positions, settled against spot after close."""

    def __init__(self):
        self.state = {"bankroll": config.BANKROLL, "wins": 0, "losses": 0,
                      "realized": 0.0, "open": []}
        if os.path.exists(BOOK_PATH):
            try:
                with open(BOOK_PATH) as f:
                    self.state.update(json.load(f))
            except (OSError, ValueError):
                pass

    def _save(self):
        try:
            with open(BOOK_PATH, "w") as f:
                json.dump(self.state, f, indent=1)
        except OSError:
            pass

    def has_open(self, ticker):
        return any(p["ticker"] == ticker for p in self.state["open"])

    def open_position(self, sig):
        budget = self.state["bankroll"] * RISK_FRAC
        contracts = int(budget * 100 // sig["ask"])
        if contracts < 1:
            return None
        cost = contracts * sig["ask"] / 100.0
        pos = {**sig, "contracts": contracts, "cost": round(cost, 4),
               "opened": datetime.now(timezone.utc).isoformat()}
        self.state["open"].append(pos)
        self._save()
        return pos

    def settle(self, spot_lookup):
        """Settle positions whose market has closed. spot_lookup(ticker)->spot."""
        now = datetime.now(timezone.utc)
        results = []
        still_open = []
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
            self.state["wins" if won else "losses"] += 1
            results.append({**p, "won": won, "pnl": round(pnl, 4), "settle_spot": spot})
        self.state["open"] = still_open
        self._save()
        return results


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def main():
    live = None
    if config.LIVE and os.environ.get("PM_CRYPTO_LIVE") == "1":
        from .kalshi_executor import KalshiLiveExecutor  # reuses key checks

        KalshiLiveExecutor()  # validates credentials early
        live = True
        log("🔴 LIVE MODE — directional trades with real funds")

    book = PaperBook()
    log("🔍 Kalshi crypto fair-value bot started "
        f"({'LIVE' if live else 'PAPER'} mode)")
    log(f"series={','.join(SERIES)} | edge>={EDGE_CENTS}c after fees | "
        f"window={MIN_MINUTES}-{MAX_MINUTES}m | risk/trade={RISK_FRAC:.0%}")

    spots = {}

    def spot_lookup(ticker):
        for series, spot in spots.items():
            if series in ticker:
                return spot
        return None

    while True:
        try:
            for series in SERIES:
                product = product_for(series)
                if not product:
                    continue
                closes = candles(product)
                if not closes:
                    continue
                spot, sigma = closes[-1], realized_vol_1m(closes)
                spots[series] = spot
                if not sigma:
                    continue
                for market in kalshi_api.get_markets(series):
                    if book.has_open(market.get("ticker", "")):
                        continue
                    sig = evaluate(market, spot, sigma)
                    if not sig:
                        continue
                    log(f"💡 {sig['side'].upper()} {sig['ticker']} ask={sig['ask']}c "
                        f"fair={sig['fair']}c edge={sig['edge']}c "
                        f"(spot={sig['spot']:.0f} K={sig['strike']:.0f} "
                        f"{sig['minutes']}m left)")
                    if live:
                        kalshi_api.create_order(
                            sig["ticker"], sig["side"], "buy",
                            max(1, int(book.state['bankroll'] * RISK_FRAC * 100 // sig['ask'])),
                            sig["ask"], ioc=True,
                        )
                        log("   ✅ LIVE order sent (IOC)")
                    pos = book.open_position(sig)
                    if pos:
                        log(f"   📝 paper position: {pos['contracts']}x @ {pos['ask']}c "
                            f"(${pos['cost']:.2f})")

            for r in book.settle(spot_lookup):
                emoji = "✅" if r["won"] else "❌"
                log(f"{emoji} settled {r['ticker']} {r['side'].upper()}: "
                    f"{'WON' if r['won'] else 'LOST'} {r['pnl']:+.4f} "
                    f"(bankroll=${book.state['bankroll']:.2f} "
                    f"W:{book.state['wins']} L:{book.state['losses']})")
        except Exception as e:
            log(f"⚠️ scan error: {e} — retrying next cycle")

        time.sleep(config.SCAN_INTERVAL)


if __name__ == "__main__":
    main()
