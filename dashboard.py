"""Live status dashboard served by the supervisor.

Serves on $PORT (Railway sets this; default 8080):
  /            — auto-refreshing HTML dashboard
  /api/status  — JSON: per-bot liveness, recent log lines, paper ledgers

To get a public URL: Railway dashboard -> service -> Settings -> Networking
-> Generate Domain (one click; Railway detects the port automatically).
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
}

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Btc-boggy bots</title><style>
body{font-family:ui-monospace,Menlo,monospace;background:#0d1117;color:#c9d1d9;margin:0;padding:16px}
h1{font-size:18px;margin:0 0 12px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:12px}
.name{font-weight:bold;font-size:15px}
.dot{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:8px}
.up{background:#3fb950}.down{background:#f85149}
.stats{color:#8b949e;font-size:13px;margin:6px 0}
.profit{color:#3fb950;font-weight:bold}
pre{background:#0d1117;border-radius:6px;padding:8px;font-size:11px;overflow-x:auto;
max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;margin:6px 0 0}
small{color:#8b949e}
</style></head><body>
<h1>🤖 Btc-boggy bots <small id="ts"></small></h1>
<div id="cards">loading…</div>
<script>
async function tick(){
  try{
    const r = await fetch('/api/status'); const s = await r.json();
    document.getElementById('ts').textContent = new Date().toLocaleTimeString();
    document.getElementById('cards').innerHTML = Object.entries(s.bots).map(([n,b])=>{
      const led = s.ledgers[n];
      const stats = led ? `<div class="stats">paper P&amp;L: <span class="profit">$${(led.realized||0).toFixed(4)}</span>
        &nbsp;fills: ${led.fills||0} &nbsp;bankroll: $${(led.bankroll||0).toFixed(2)}</div>` : '';
      return `<div class="card"><span class="dot ${b.alive?'up':'down'}"></span>
        <span class="name">${n}</span> ${b.alive?'running':'stopped'}
        ${stats}<pre>${(b.lines||[]).join('')||'(no output yet)'}</pre></div>`;
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
            bots = {
                name: {"alive": st["alive"], "lines": list(st["lines"])[-40:]}
                for name, st in STATE.items()
            }
            ledgers = {}
            for name, path in LEDGERS.items():
                if os.path.exists(path):
                    try:
                        with open(path) as f:
                            d = json.load(f)
                        ledgers[name] = {
                            "realized": d.get("realized"),
                            "fills": d.get("fills"),
                            "bankroll": d.get("bankroll"),
                        }
                    except (OSError, ValueError):
                        pass
            body = json.dumps({"bots": bots, "ledgers": ledgers}).encode()
            self._send(200, body, "application/json")
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
