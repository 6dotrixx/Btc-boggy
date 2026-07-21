"""Preflight self-test against the REAL Kalshi API.

Runs inside the bot process on Railway (which can reach Kalshi) and exercises
the live endpoints in order, reporting PASS/FAIL for each:

  1. exchange_status   — public: is the exchange reachable and open?
  2. get_markets       — public: does a crypto series return markets?
  3. get_orderbook     — public: does a real book come back?
  4. get_balance       — AUTHENTICATED: do the API keys sign correctly, and
                         what's the real account balance?

It never places an order — the order path's first real test is the canary
(1-contract) trade by design. Trigger by setting PM_SELFTEST=1 in Railway;
it also runs automatically at live-mode startup.
"""

from . import kalshi_api


def run_preflight(series="KXBTC", authed=True, log=print):
    results = []

    def check(name, fn):
        try:
            val = fn()
            results.append((name, True, val))
            log(f"   ✅ {name}: {val}")
            return val
        except Exception as e:
            msg = f"{type(e).__name__}: {e}"[:140]
            results.append((name, False, msg))
            log(f"   ❌ {name}: {msg}")
            return None

    log("🧪 Kalshi real-API preflight self-test")

    def _status():
        s = kalshi_api.exchange_status()
        return (f"exchange_active={s.get('exchange_active')} "
                f"trading_active={s.get('trading_active')} "
                f"[host {kalshi_api.base_url()}]")

    check("exchange_status", _status)

    markets = check("get_markets", lambda: kalshi_api.get_markets(series, limit=5))
    ticker = None
    if markets:
        ticker = markets[0].get("ticker")
        log(f"      sample market: {ticker}")

    if ticker:
        def _book():
            b = kalshi_api.get_orderbook(ticker)
            yes, no = b.get("yes") or [], b.get("no") or []
            return f"{len(yes)} yes levels, {len(no)} no levels"
        check("get_orderbook", _book)

    if authed:
        check("get_balance (auth)", lambda: f"${kalshi_api.get_balance():.2f}")

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    verdict = "ALL PASSED ✅" if passed == total else f"{passed}/{total} passed ⚠️"
    log(f"🧪 preflight: {verdict}")
    return results
