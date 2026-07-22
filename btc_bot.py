"""
============================================
  BTC Trading Bot v2 — Coinbase Advanced
  Strategy: 1H EMA 9/21 + RSI>55 + ADX>20
  Deployment: Railway.app
============================================
"""

import os
import time
import hmac
import hashlib
import json
import requests
from datetime import datetime, timezone

# ─────────────────────────────────────────
#  🔑  CREDENTIALS — set in Railway vars
# ─────────────────────────────────────────
API_KEY    = os.environ.get("CB_API_KEY", "")
API_SECRET = os.environ.get("CB_API_SECRET", "")

# Paper mode (simulated money) is the DEFAULT and needs no keys. Real trading
# only happens when CB_LIVE=1 AND both keys are present — so a beginner can
# watch it work risk-free first, exactly like the Kalshi bot.
LIVE  = os.environ.get("CB_LIVE", "0") == "1"
PAPER = not (LIVE and API_KEY and API_SECRET)
if LIVE and not (API_KEY and API_SECRET):
    raise ValueError("CB_LIVE=1 requires CB_API_KEY and CB_API_SECRET to be set.")

# Public price feed (no auth) — used for candles in paper mode.
PUBLIC_CANDLES = "https://api.exchange.coinbase.com"
PUBLIC_GRANULARITY = 3600  # 1-hour candles

# ─────────────────────────────────────────
#  ⚙️  STRATEGY SETTINGS (IMPROVED v2)
# ─────────────────────────────────────────
SYMBOL          = "BTC-USD"
CANDLE_INTERVAL = "ONE_HOUR"       # 1H chart — less noise than 5min
TRADE_AMOUNT    = float(os.environ.get("TRADE_AMOUNT", "20.0"))
TAKE_PROFIT_PCT = float(os.environ.get("TAKE_PROFIT", "0.05"))   # 5%
STOP_LOSS_PCT   = float(os.environ.get("STOP_LOSS",   "0.02"))   # 2%
EMA_FAST        = 9
EMA_SLOW        = 21               # 21 instead of 20 — more reliable
RSI_PERIOD      = 14
RSI_THRESHOLD   = 55               # Stricter: 55 instead of 50
ADX_PERIOD      = 14
ADX_THRESHOLD   = 20               # NEW: ADX filter — only trade strong trends
LOOP_SECONDS    = 300              # Check every 5 min (1H candles don't need 60s)

BASE_URL = "https://api.coinbase.com"

# ─────────────────────────────────────────
#  INDICATOR CALCULATIONS
# ─────────────────────────────────────────
def calc_ema(closes, period):
    k = 2 / (period + 1)
    ema = []
    prev = None
    for i, c in enumerate(closes):
        if i < period - 1:
            ema.append(None)
            continue
        if prev is None:
            prev = sum(closes[:period]) / period
            ema.append(prev)
        else:
            prev = c * k + prev * (1 - k)
            ema.append(prev)
    return ema

def calc_rsi(closes, period=14):
    rsi = [None] * period
    for i in range(period, len(closes)):
        gains = losses = 0
        for j in range(i - period + 1, i + 1):
            diff = closes[j] - closes[j-1]
            if diff > 0: gains += diff
            else: losses += abs(diff)
        rs = gains / losses if losses > 0 else 100
        rsi.append(100 - 100 / (1 + rs))
    return rsi

def calc_adx(highs, lows, closes, period=14):
    """Average Directional Index — measures trend strength"""
    if len(closes) < period * 2:
        return [None] * len(closes)

    tr_list, dm_plus, dm_minus = [], [], []

    for i in range(1, len(closes)):
        high, low, prev_close = highs[i], lows[i], closes[i-1]
        prev_high, prev_low  = highs[i-1], lows[i-1]

        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        tr_list.append(tr)

        up   = high - prev_high
        down = prev_low - low
        dm_plus.append(up if up > down and up > 0 else 0)
        dm_minus.append(down if down > up and down > 0 else 0)

    def smooth(data, p):
        result = [None] * (p - 1)
        result.append(sum(data[:p]))
        for i in range(p, len(data)):
            result.append(result[-1] - result[-1] / p + data[i])
        return result

    atr    = smooth(tr_list, period)
    sdp    = smooth(dm_plus, period)
    sdm    = smooth(dm_minus, period)

    adx_vals = [None] * (period * 2)
    dx_list  = []

    for i in range(period - 1, len(atr)):
        if atr[i] and atr[i] > 0:
            di_plus  = 100 * sdp[i] / atr[i]
            di_minus = 100 * sdm[i] / atr[i]
            denom = di_plus + di_minus
            dx = 100 * abs(di_plus - di_minus) / denom if denom > 0 else 0
            dx_list.append(dx)

    if len(dx_list) >= period:
        adx_smooth = [sum(dx_list[:period]) / period]
        for i in range(period, len(dx_list)):
            adx_smooth.append((adx_smooth[-1] * (period - 1) + dx_list[i]) / period)
        return [None] * (len(closes) - len(adx_smooth)) + adx_smooth

    return [None] * len(closes)


# ─────────────────────────────────────────
#  BOT CLASS
# ─────────────────────────────────────────
class CoinbaseBot:
    def __init__(self):
        self.in_trade      = False
        self.entry_price   = None
        self.position_size = None
        self.take_profit   = None
        self.stop_loss     = None
        self.trade_count   = 0
        self.wins          = 0
        self.losses        = 0
        self.pnl_total     = 0.0

    def _headers(self, method, path, body=""):
        timestamp = str(int(time.time()))
        message   = timestamp + method + path + body
        signature = hmac.new(
            API_SECRET.encode("utf-8"),
            message.encode("utf-8"),
            digestmod=hashlib.sha256
        ).hexdigest()
        return {
            "CB-ACCESS-KEY":       API_KEY,
            "CB-ACCESS-SIGN":      signature,
            "CB-ACCESS-TIMESTAMP": timestamp,
            "Content-Type":        "application/json",
        }

    def get_candles(self):
        if PAPER:
            return self._public_candles()
        path    = f"/api/v3/brokerage/products/{SYMBOL}/candles"
        params  = {"granularity": CANDLE_INTERVAL, "limit": 150}
        headers = self._headers("GET", path)
        resp    = requests.get(BASE_URL + path, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json().get("candles", [])
        candles = sorted(data, key=lambda x: x["start"])
        return {
            "closes": [float(c["close"]) for c in candles],
            "highs":  [float(c["high"])  for c in candles],
            "lows":   [float(c["low"])   for c in candles],
        }

    def _public_candles(self):
        """Auth-free 1H candles from Coinbase Exchange (for paper mode)."""
        resp = requests.get(
            f"{PUBLIC_CANDLES}/products/{SYMBOL}/candles",
            params={"granularity": PUBLIC_GRANULARITY}, timeout=15,
        )
        resp.raise_for_status()
        # rows: [time, low, high, open, close, volume], newest first
        rows = sorted(resp.json(), key=lambda r: r[0])[-150:]
        return {
            "closes": [float(r[4]) for r in rows],
            "highs":  [float(r[2]) for r in rows],
            "lows":   [float(r[1]) for r in rows],
        }

    def get_signals(self, data):
        closes = data["closes"]
        highs  = data["highs"]
        lows   = data["lows"]

        ema_f = calc_ema(closes, EMA_FAST)
        ema_s = calc_ema(closes, EMA_SLOW)
        rsi   = calc_rsi(closes, RSI_PERIOD)
        adx   = calc_adx(highs, lows, closes, ADX_PERIOD)

        i    = len(closes) - 1
        prev = i - 1

        ema_cross_up   = (ema_f[prev] is not None and ema_s[prev] is not None and
                          ema_f[prev] <= ema_s[prev] and ema_f[i] > ema_s[i])
        ema_cross_down = (ema_f[prev] is not None and ema_s[prev] is not None and
                          ema_f[prev] >= ema_s[prev] and ema_f[i] < ema_s[i])

        rsi_ok  = rsi[i] is not None and rsi[i] > RSI_THRESHOLD
        adx_ok  = adx[i] is not None and adx[i] > ADX_THRESHOLD

        return {
            "price":       closes[i],
            "ema_fast":    ema_f[i],
            "ema_slow":    ema_s[i],
            "rsi":         rsi[i],
            "adx":         adx[i],
            "buy_signal":  ema_cross_up and rsi_ok and adx_ok,
            "sell_signal": ema_cross_down,
        }

    def buy(self, usd_amount):
        if PAPER:
            return {"paper": True, "side": "BUY", "usd": round(usd_amount, 2)}
        path = "/api/v3/brokerage/orders"
        body = json.dumps({
            "client_order_id": f"bot-buy-{int(time.time())}",
            "product_id":      SYMBOL,
            "side":            "BUY",
            "order_configuration": {
                "market_market_ioc": {"quote_size": str(round(usd_amount, 2))}
            }
        })
        headers = self._headers("POST", path, body)
        resp    = requests.post(BASE_URL + path, headers=headers, data=body)
        resp.raise_for_status()
        return resp.json()

    def sell(self, btc_amount):
        if PAPER:
            return {"paper": True, "side": "SELL", "btc": round(btc_amount, 8)}
        path = "/api/v3/brokerage/orders"
        body = json.dumps({
            "client_order_id": f"bot-sell-{int(time.time())}",
            "product_id":      SYMBOL,
            "side":            "SELL",
            "order_configuration": {
                "market_market_ioc": {"base_size": str(round(btc_amount, 8))}
            }
        })
        headers = self._headers("POST", path, body)
        resp    = requests.post(BASE_URL + path, headers=headers, data=body)
        resp.raise_for_status()
        return resp.json()

    def log(self, msg):
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        print(f"[{ts}] {msg}", flush=True)

    def run(self):
        mode = "🔴 LIVE (real money)" if not PAPER else "📝 PAPER (simulated)"
        self.log(f"🤖 BTC Bot v2 started — Coinbase Advanced — {mode}")
        self.log(f"Strategy: EMA {EMA_FAST}/{EMA_SLOW} | RSI>{RSI_THRESHOLD} | ADX>{ADX_THRESHOLD} | 1H chart")
        self.log(f"Trade: ${TRADE_AMOUNT} | TP: +{TAKE_PROFIT_PCT*100}% | SL: -{STOP_LOSS_PCT*100}%")
        self.log("─" * 55)

        while True:
            try:
                data = self.get_candles()
                sig  = self.get_signals(data)

                rsi_str = f"{sig['rsi']:.1f}" if sig['rsi'] else "N/A"
                adx_str = f"{sig['adx']:.1f}" if sig['adx'] else "N/A"

                self.log(
                    f"BTC=${sig['price']:,.2f} | "
                    f"RSI={rsi_str} | ADX={adx_str} | "
                    f"Trade={'IN ✅' if self.in_trade else 'OUT'} | "
                    f"P&L=${self.pnl_total:+.2f} | "
                    f"W:{self.wins} L:{self.losses}"
                )

                if self.in_trade:
                    price = sig["price"]
                    if price >= self.take_profit:
                        pnl = (price - self.entry_price) * self.position_size
                        self.log(f"✅ TAKE PROFIT at ${price:,.2f} | +${pnl:.2f}")
                        self.sell(self.position_size)
                        self.pnl_total += pnl
                        self.wins += 1
                        self.in_trade = False

                    elif price <= self.stop_loss:
                        pnl = (price - self.entry_price) * self.position_size
                        self.log(f"🛑 STOP LOSS at ${price:,.2f} | ${pnl:.2f}")
                        self.sell(self.position_size)
                        self.pnl_total += pnl
                        self.losses += 1
                        self.in_trade = False

                    elif sig["sell_signal"]:
                        pnl = (price - self.entry_price) * self.position_size
                        self.log(f"📤 EMA CROSS EXIT at ${price:,.2f} | ${pnl:.2f}")
                        self.sell(self.position_size)
                        self.pnl_total += pnl
                        if pnl > 0: self.wins += 1
                        else: self.losses += 1
                        self.in_trade = False

                else:
                    if sig["buy_signal"]:
                        price   = sig["price"]
                        btc_qty = TRADE_AMOUNT / price
                        self.log(f"📈 BUY SIGNAL | EMA✅ RSI✅ ADX✅")
                        self.log(f"   Entry: ${price:,.2f} | TP: ${price*(1+TAKE_PROFIT_PCT):,.2f} | SL: ${price*(1-STOP_LOSS_PCT):,.2f}")
                        self.buy(TRADE_AMOUNT)
                        self.entry_price   = price
                        self.position_size = btc_qty
                        self.take_profit   = price * (1 + TAKE_PROFIT_PCT)
                        self.stop_loss     = price * (1 - STOP_LOSS_PCT)
                        self.in_trade      = True
                        self.trade_count  += 1
                    else:
                        # Show which filters are blocking entry
                        reasons = []
                        if sig['rsi'] and sig['rsi'] <= RSI_THRESHOLD:
                            reasons.append(f"RSI {sig['rsi']:.1f}<{RSI_THRESHOLD}")
                        if sig['adx'] and sig['adx'] <= ADX_THRESHOLD:
                            reasons.append(f"ADX {sig['adx']:.1f}<{ADX_THRESHOLD}")
                        if reasons:
                            self.log(f"   Waiting — filters blocking: {', '.join(reasons)}")

            except Exception as e:
                self.log(f"⚠️ Error: {e} — retrying in 60s")
                time.sleep(60)
                continue

            time.sleep(LOOP_SECONDS)


if __name__ == "__main__":
    bot = CoinbaseBot()
    bot.run()
