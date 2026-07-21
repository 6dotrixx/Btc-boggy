"""Set-arbitrage detection on Kalshi, fee-aware.

Kalshi events carry a `mutually_exclusive` flag, so unlike Polymarket US we
can scan multi-outcome events safely — the exchange itself asserts that
exactly one outcome resolves YES.

Two shapes, prices in cents:
- YES set: buy YES on every outcome. Payout 100c; profitable when
  100 - sum(yes_asks) - taker_fees >= min edge.
- NO set: buy NO on every outcome. Payout (n-1)*100c; profitable when
  (n-1)*100 - sum(no_asks) - taker_fees >= min edge.

Two-stage scan: cheap pass over the bulk quotes embedded in the events feed,
then an orderbook fetch per candidate to confirm prices and get real depth.
"""

from . import config, kalshi_api


def _edge_cents(payout_cents, asks):
    cost = sum(a for a, _ in asks)
    fees = sum(kalshi_api.taker_fee_cents(a) for a, _ in asks)
    return payout_cents - cost - fees


def scan(events):
    min_edge_cents = config.MIN_EDGE * 100
    for event in events:
        if not event.get("mutually_exclusive"):
            continue
        markets = [
            m for m in (event.get("markets") or []) if m.get("status") == "active"
        ]
        if len(markets) < 2:
            continue

        # Stage 1: quotes from the bulk feed (may be slightly stale).
        yes_asks = [m.get("yes_ask") or 0 for m in markets]
        no_asks = [m.get("no_ask") or 0 for m in markets]
        if any(a <= 0 or a >= 100 for a in yes_asks + no_asks):
            continue
        n = len(markets)
        rough_yes = 100 - sum(yes_asks) - sum(map(kalshi_api.taker_fee_cents, yes_asks))
        rough_no = (n - 1) * 100 - sum(no_asks) - sum(map(kalshi_api.taker_fee_cents, no_asks))
        if max(rough_yes, rough_no) < min_edge_cents:
            continue

        # Stage 2: confirm against live orderbooks (real price + depth).
        side = "yes" if rough_yes >= rough_no else "no"
        payout = 100 if side == "yes" else (n - 1) * 100
        asks = []
        ok = True
        for m in markets:
            book = kalshi_api.get_orderbook(m["ticker"])
            quote = kalshi_api.best_cross(book, side)
            if not quote:
                ok = False
                break
            asks.append(quote)
        if not ok:
            continue

        edge = _edge_cents(payout, asks)
        if edge < min_edge_cents:
            continue
        yield {
            "kind": f"{side}_set",
            "event": event.get("event_ticker"),
            "question": event.get("title", "?"),
            "legs": [
                {"ticker": m["ticker"], "side": side, "price": a}
                for m, (a, _) in zip(markets, asks)
            ],
            "cost": round(sum(a for a, _ in asks) / 100.0, 4),
            "payout": payout / 100.0,
            "edge": round(edge / 100.0, 4),
            "size": min(d for _, d in asks),
        }
