"""Polymarket US (regulated exchange) data + client access via the official
`polymarket-us` SDK.

Auth uses POLYMARKET_KEY_ID / POLYMARKET_SECRET_KEY (Ed25519 request signing is
handled inside the SDK). Market data works without credentials.
"""

import os


_client = None


def client():
    global _client
    if _client is None:
        from polymarket_us import PolymarketUS

        _client = PolymarketUS(
            key_id=os.environ.get("POLYMARKET_KEY_ID"),
            secret_key=os.environ.get("POLYMARKET_SECRET_KEY"),
        )
    return _client


def amount(x):
    """Parse an Amount ({'value': '0.55', 'currency': 'USD'}) or scalar to float."""
    if x is None:
        return None
    if isinstance(x, dict):
        x = x.get("value")
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def get_active_events(limit=100):
    """Active, open events with their outcome markets, highest volume first."""
    resp = client().events.list(
        {"active": True, "closed": False, "limit": limit, "orderBy": ["volume"]}
    )
    events = resp.get("events") if isinstance(resp, dict) else resp
    return events or []


def get_bbo(slug):
    """Best bid/offer for a market slug -> (bid, ask, bid_depth, ask_depth)."""
    bbo = client().markets.bbo(slug)
    return (
        amount(bbo.get("bid")),
        amount(bbo.get("ask")),
        int(bbo.get("bidDepth") or 0),
        int(bbo.get("askDepth") or 0),
    )
