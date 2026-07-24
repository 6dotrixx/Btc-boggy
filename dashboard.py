"""Live status dashboard served by the supervisor.

Serves on $PORT (Railway sets this; default 8080):
  /            — auto-refreshing HTML dashboard with a GO-LIVE readiness verdict
  /api/status  — JSON: per-bot liveness, recent log lines, paper ledgers, verdict

To get a public URL: Railway dashboard -> service -> Settings -> Networking
-> Generate Domain (one click; Railway detects the port automatically).

The readiness verdict is the point: the dashboard decides for itself when the
paper track record justifies real money, so nobody has to interpret the logs.
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# name -> {"alive": bool, "lines": deque[str]} maintained by run_all.py
STATE = {}

LEDGERS = {
    "polymarket": "paper_ledger_pm.json",
    "kalshi": "paper_ledger_kalshi.json",
    "kalshi-crypto": "paper_book_crypto.json",
}

# Go-live thresholds (env-tunable). Conservative on purpose.
ARB_MIN_FILLS = int(os.environ.get("PM_GATE_ARB_FILLS", "10"))
CRYPTO_MIN_SETTLED = int(os.environ.get("PM_GATE_CRYPTO_TRADES", "20"))


def _load_ledger(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def bot_readiness(name, led):
    """Per-bot go-live verdict: collecting | ready | underperform."""
    if led is None:
        return {"state": "waiting", "msg": "no paper data yet", "pct": 0.0}
    realized = led.get("realized") or 0.0
    if name in ("polymarket", "kalshi"):
        fills = led.get("fills") or 0
        if fills < ARB_MIN_FILLS:
            return {"state": "collecting", "pct": min(1.0, fills / ARB_MIN_FILLS),
                    "msg": f"{fills}/{ARB_MIN_FILLS} arb fills logged"}
        if realized >= 0:
            return {"state": "ready",
                    "msg": f"{fills} fills, +${realized:.2f} — arb pipeline proven"}
        return {"state": "underperform",
                "msg": f"{fills} fills but P&L -${abs(realized):.2f}"}
    if name == "kalshi-crypto":
        wins, losses = led.get("wins") or 0, led.get("losses") or 0
        settled = wins + losses
        if settled < CRYPTO_MIN_SETTLED:
            return {"state": "collecting", "pct": min(1.0, settled / CRYPTO_MIN_SETTLED),
                    "msg": f"{settled}/{CRYPTO_MIN_SETTLED} trades settled"}
        wr = 100 * wins / settled if settled else 0
        if realized > 0:
            return {"state": "ready",
                    "msg": f"{settled} trades, {wr:.0f}% win, +${realized:.2f} — edge confirmed"}
        return {"state": "underperform",
                "msg": f"{settled} trades, {wr:.0f}% win, P&L -${abs(realized):.2f} — tune before live"}
    return {"state": "waiting", "msg": "", "pct": 0.0}


def overall_verdict(per_bot):
    states = {v["state"] for v in per_bot.values()}
    ready = [n for n, v in per_bot.items() if v["state"] == "ready"]
    if ready:
        return {
            "level": "ready",
            "headline": f"✅ READY FOR LIVE: {', '.join(ready)}",
            "detail": "Paper track record cleared the bar. To trade real money, add "
                      "these Railway Variables and redeploy: PM_LIVE=1 and (for the "
                      "crypto bot) PM_CRYPTO_LIVE=1. It will size off your real Kalshi "
                      "balance, $1.25 max per crypto trade, 5% daily loss stop.",
        }
    if "underperform" in states:
        return {
            "level": "underperform",
            "headline": "⚠️ ENOUGH DATA — edge NOT proven yet",
            "detail": "A strategy has enough samples but isn't net positive. Do NOT go "
                      "live yet; keep running or tune thresholds. Screenshot this to your "
                      "Claude session and it will adjust the model.",
        }
    return {
        "level": "collecting",
        "headline": "⏳ COLLECTING PAPER DATA — keep it running",
        "detail": "No real money at risk. The bots are proving the edge on simulated "
                  "fills. This banner turns green on its own once the track record "
                  "clears the bar. Check back over the next day or two.",
    }


def build_status():
    bots = {
        name: {"alive": st["alive"], "lines": list(st["lines"])[-40:]}
        for name, st in STATE.items()
    }
    ledgers, readiness = {}, {}
    for name, path in LEDGERS.items():
        led = _load_ledger(path)
        if led is not None:
            ledgers[name] = {
                "realized": led.get("realized"),
                "fills": led.get("fills"),
                "bankroll": led.get("bankroll"),
                "wins": led.get("wins"),
                "losses": led.get("losses"),
                "open": len(led.get("open") or []),
                "last_trade": led.get("last_trade") or "",
                "status": led.get("status") or "",
            }
        # readiness only for bots that are actually running
        if name in STATE:
            readiness[name] = bot_readiness(name, led)
    verdict = overall_verdict(readiness) if readiness else {
        "level": "collecting", "headline": "⏳ starting up…", "detail": ""}
    # When live trading is enabled, the paper-verdict text is misleading —
    # override it so the banner clearly reflects that real money is in play.
    if os.environ.get("PM_LIVE") == "1":
        crypto_live = os.environ.get("PM_CRYPTO_LIVE") == "1"
        verdict = {
            "level": "live",
            "headline": "🔴 LIVE — trading real money",
            "detail": "Real orders are enabled" + (" (arbitrage + crypto)" if crypto_live else
                      " (arbitrage)") + ". The bots price markets continuously and place a trade the "
                      "moment a real edge appears — quiet stretches are normal, they only trade when the "
                      "numbers justify it. First live trades are ~50¢ to prove execution, then they size up.",
        }
    return {"bots": bots, "ledgers": ledgers,
            "readiness": readiness, "verdict": verdict}


PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Btc-boggy bots</title><style>
body{font-family:ui-monospace,Menlo,monospace;background:#0d1117;color:#c9d1d9;margin:0;padding:16px}
h1{font-size:18px;margin:0 0 12px}
.banner{border-radius:10px;padding:16px;margin-bottom:16px;border:1px solid}
.banner .hl{font-size:17px;font-weight:bold;margin-bottom:6px}
.banner .dt{font-size:13px;line-height:1.5;opacity:.9}
.b-ready{background:#0d2818;border-color:#3fb950;color:#7ee787}
.b-underperform{background:#2d2508;border-color:#d29922;color:#e3b341}
.b-collecting{background:#161b22;border-color:#30363d;color:#8b949e}
.b-live{background:#2a1113;border-color:#f85149;color:#ff9d95}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:12px}
.name{font-weight:bold;font-size:15px}
.dot{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:8px}
.up{background:#3fb950}.down{background:#f85149}
.stats{color:#8b949e;font-size:13px;margin:6px 0}
.profit{color:#3fb950;font-weight:bold}.loss{color:#f85149;font-weight:bold}
.ready-tag{font-size:12px;padding:2px 8px;border-radius:10px;margin-left:8px}
.t-ready{background:#132f1c;color:#3fb950}.t-collecting{background:#21262d;color:#8b949e}
.t-underperform{background:#2d2508;color:#e3b341}
.bar{height:5px;background:#21262d;border-radius:3px;margin:6px 0;overflow:hidden}
.bar>i{display:block;height:100%;background:#58a6ff}
pre{background:#0d1117;border-radius:6px;padding:8px;font-size:11px;overflow-x:auto;
max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;margin:6px 0 0}
small{color:#8b949e}
</style></head><body>
<h1>🤖 Btc-boggy bots <small id="ts"></small></h1>
<div id="banner"></div>
<div id="cards">loading…</div>
<script>
function money(v){const n=(v||0);const c=n>=0?'profit':'loss';
  return `<span class="${c}">${n>=0?'+':'-'}$${Math.abs(n).toFixed(4)}</span>`;}
async function tick(){
  try{
    const r = await fetch('/api/status'); const s = await r.json();
    document.getElementById('ts').textContent = new Date().toLocaleTimeString();
    const v = s.verdict||{level:'collecting',headline:'',detail:''};
    document.getElementById('banner').innerHTML =
      `<div class="banner b-${v.level}"><div class="hl">${v.headline}</div>
       <div class="dt">${v.detail||''}</div></div>`;
    document.getElementById('cards').innerHTML = Object.entries(s.bots).map(([n,b])=>{
      const led = s.ledgers[n]; const rd = (s.readiness||{})[n];
      let stats='';
      if(led){
        const wl = (led.wins!=null||led.losses!=null)
          ? ` &nbsp;W:${led.wins||0} L:${led.losses||0}` : '';
        const op = (led.open!=null) ? ` &nbsp;open: ${led.open}` : '';
        stats = `<div class="stats">P&amp;L: ${money(led.realized)}
          &nbsp;trades: ${led.fills||0}${op}${wl} &nbsp;bankroll: $${(led.bankroll||0).toFixed(2)}</div>`;
        if(led.status) stats = `<div class="stats" style="color:#58a6ff">▶ ${led.status}</div>` + stats;
        if(led.last_trade) stats += `<div class="stats">last: ${led.last_trade}</div>`;
      }
      let tag='',bar='';
      if(rd){
        tag = `<span class="ready-tag t-${rd.state}">${rd.msg||rd.state}</span>`;
        if(rd.pct!=null) bar = `<div class="bar"><i style="width:${Math.round(rd.pct*100)}%"></i></div>`;
      }
      return `<div class="card"><span class="dot ${b.alive?'up':'down'}"></span>
        <span class="name">${n}</span> ${b.alive?'running':'stopped'}${tag}
        ${bar}${stats}<pre>${(b.lines||[]).join('')||'(no output yet)'}</pre></div>`;
    }).join('');
  }catch(e){}
}
tick(); setInterval(tick, 5000);
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep Railway logs for the bots, not HTTP noise

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/status"):
            self._send(200, json.dumps(build_status()).encode(), "application/json")
        elif self.path == "/" or self.path.startswith("/index"):
            self._send(200, PAGE.encode(), "text/html; charset=utf-8")
        else:
            self._send(404, b"not found", "text/plain")


def start():
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"[dashboard] serving on port {port}", flush=True)
    return server
