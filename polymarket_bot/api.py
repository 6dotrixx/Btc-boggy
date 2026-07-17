"""Read-only clients for Polymarket's public Gamma (discovery) and CLOB (books) APIs.

No authentication is needed for market data. Order placement (Phase 2+) will go
through the official py-sdk instead.
"""

import json

import requests

from . import config


session = requests.Session()
session.headers["User-Agent"] = "btc-boggy-polymarket-scanner/0.1"


def get_active_markets(limit=None):
    """Return active, open binary markets from Gamma, highest volume first.

    Each market dict includes `clobTokenIds` (JSON-encoded list: [YES, NO]).
    """
    limit = limit or config.MAX_MARKETS
    markets = []
    offset = 0
    page = 100
    while len(markets) < limit:
        resp = session.get(
            f"{config.GAMMA_URL}/markets",
            params={
                "active": "true",
                "closed": "false",
                "limit": min(page, limit - len(markets)),
                "offset": offset,
                "order": "volumeNum",
                "ascending": "false",
            },
            timeout=config.REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        markets.extend(batch)
        offset += len(batch)
        if len(batch) < page:
            break
    return markets


def token_ids(market):
    """Extract the [YES, NO] CLOB token ids from a Gamma market, or None."""
    raw = market.get("clobTokenIds")
    if not raw:
        return None
    ids = json.loads(raw) if isinstance(raw, str) else raw
    return ids if len(ids) == 2 else None


def get_books(token_id_list):
    """Fetch order books for many tokens in one call. Returns {token_id: book}.

    A book is {"bids": [{"price","size"},...], "asks": [...]} with prices as
    strings, best price NOT guaranteed first — callers should sort.
    """
    resp = session.post(
        f"{config.CLOB_URL}/books",
        json=[{"token_id": t} for t in token_id_list],
        timeout=config.REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return {b["asset_id"]: b for b in resp.json()}


def best_ask(book):
    """Return (price, size) of the lowest ask, or None if the side is empty."""
    asks = book.get("asks") or []
    if not asks:
        return None
    best = min(asks, key=lambda a: float(a["price"]))
    return float(best["price"]), float(best["size"])
