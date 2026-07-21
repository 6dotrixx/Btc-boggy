"""Kalshi REST API access: public market data + RSA-signed trading requests.

Market data (events, orderbooks) is public. Trading needs an API key created
at kalshi.com -> account -> API keys:
  KALSHI_API_KEY_ID      — the key's UUID
  KALSHI_PRIVATE_KEY_PEM — the RSA private key PEM text (paste into Railway)

Request signing: sign(timestamp_ms + METHOD + path) with RSA-PSS/SHA256.
"""

import base64
import json
import math
import os
import time

import requests

BASE = "https://api.elections.kalshi.com"
API = "/trade-api/v2"
TIMEOUT = 15

session = requests.Session()
session.headers["User-Agent"] = "btc-boggy-kalshi-bot/0.1"

_signer = None


def _private_key():
    global _signer
    if _signer is None:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key

        pem = os.environ.get("KALSHI_PRIVATE_KEY_PEM", "")
        if not pem:
            raise ValueError("KALSHI_PRIVATE_KEY_PEM is not set")
        _signer = load_pem_private_key(pem.encode(), password=None)
    return _signer


def _auth_headers(method, path):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    key_id = os.environ.get("KALSHI_API_KEY_ID", "")
    if not key_id:
        raise ValueError("KALSHI_API_KEY_ID is not set")
    ts = str(int(time.time() * 1000))
    msg = (ts + method + path).encode()
    sig = _private_key().sign(
        msg,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.DIGEST_LENGTH,
        ),
        hashes.SHA256(),
    )
    return {
        "KALSHI-ACCESS-KEY": key_id,
        "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(),
        "KALSHI-ACCESS-TIMESTAMP": ts,
        "Content-Type": "application/json",
    }


def get_open_events(limit=200):
    """Open events with nested markets. Only auth-free public data."""
    events, cursor = [], ""
    while len(events) < limit:
        params = {
            "status": "open",
            "with_nested_markets": "true",
            "limit": min(200, limit - len(events)),
        }
        if cursor:
            params["cursor"] = cursor
        resp = session.get(f"{BASE}{API}/events", params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        events.extend(data.get("events") or [])
        cursor = data.get("cursor")
        if not cursor:
            break
    return events


def get_markets(series_ticker, limit=100):
    """Open markets for one series (e.g. Kalshi's hourly BTC price series)."""
    resp = session.get(
        f"{BASE}{API}/markets",
        params={"series_ticker": series_ticker, "status": "open", "limit": limit},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("markets") or []


def get_orderbook(ticker):
    """Order book for one market: {'yes': [[price,count],...], 'no': [...]}.

    Levels are resting BIDS on each side, best bid = highest price. Buying
    YES crosses the NO bids (yes_ask = 100 - best_no_bid) and vice versa.
    """
    resp = session.get(f"{BASE}{API}/markets/{ticker}/orderbook", timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json().get("orderbook") or {}


def best_cross(orderbook, buy_side):
    """(ask_cents, depth) to BUY `buy_side` ('yes'|'no') from the book."""
    opposite = orderbook.get("no" if buy_side == "yes" else "yes") or []
    if not opposite:
        return None
    price, count = max(opposite, key=lambda l: l[0])
    return 100 - price, count


def taker_fee_cents(price_cents, count=1):
    """Kalshi taker fee: ceil(0.07 * C * P * (1-P)) in cents."""
    p = price_cents / 100.0
    return math.ceil(7 * count * p * (1 - p))


def create_order(ticker, side, action, count, price_cents, ioc=True):
    """Place a limit order. ioc=True sets expiration in the past, which the
    exchange treats as immediate-or-cancel: fill what's crossing, cancel rest.
    """
    path = f"{API}/portfolio/orders"
    body = {
        "ticker": ticker,
        "client_order_id": f"bb-{int(time.time()*1000)}",
        "side": side,
        "action": action,
        "count": int(count),
        "type": "limit",
        f"{side}_price": int(price_cents),
    }
    if ioc:
        body["expiration_ts"] = 1
    resp = session.post(
        f"{BASE}{path}",
        headers=_auth_headers("POST", path),
        data=json.dumps(body),
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("order") or {}
