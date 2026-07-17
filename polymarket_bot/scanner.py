"""Set-arbitrage detection: find binary markets where ask(YES) + ask(NO) < $1.

Buying one YES and one NO share locks in a $1 payout at resolution regardless
of outcome, so any combined cost below $1 (minus edge buffer) is risk-free
profit at fill time. Executable size is capped by the thinner of the two asks.
"""

from . import api, config


def scan(markets):
    """Yield arb opportunities across the given Gamma markets.

    Yields dicts: {market, question, yes_price, no_price, edge, size, profit}.
    """
    scannable = []
    for m in markets:
        if float(m.get("liquidityNum") or 0) < config.MIN_LIQUIDITY:
            continue
        ids = api.token_ids(m)
        if ids:
            scannable.append((m, ids))

    # Batch book fetches 50 tokens at a time to stay well under payload limits.
    all_tokens = [t for _, ids in scannable for t in ids]
    books = {}
    for i in range(0, len(all_tokens), 50):
        books.update(api.get_books(all_tokens[i : i + 50]))

    for market, (yes_id, no_id) in scannable:
        yes_book, no_book = books.get(yes_id), books.get(no_id)
        if not yes_book or not no_book:
            continue
        yes = api.best_ask(yes_book)
        no = api.best_ask(no_book)
        if not yes or not no:
            continue
        (yes_price, yes_size), (no_price, no_size) = yes, no
        cost = yes_price + no_price
        edge = 1.0 - cost
        if edge < config.MIN_EDGE:
            continue
        size = min(yes_size, no_size)
        yield {
            "market": market.get("conditionId") or market.get("id"),
            "question": market.get("question", "?"),
            "yes_price": yes_price,
            "no_price": no_price,
            "edge": round(edge, 4),
            "size": size,
            "profit": round(edge * size, 4),
        }
