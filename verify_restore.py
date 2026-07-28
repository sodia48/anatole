from __future__ import annotations

import ast
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent

REQUIRED = [
    "apps/api/app/api/router.py",
    "apps/api/app/api/routes/discovery.py",
    "apps/api/app/api/routes/etf_holdings.py",
    "apps/api/app/api/routes/ipo_insiders.py",
    "apps/api/app/services/screener.py",
    "apps/api/app/services/market_data.py",
    "apps/api/app/services/etf.py",
    "apps/api/app/services/etf_holdings.py",
    "apps/api/app/services/etf_history.py",
    "apps/api/app/services/ipo.py",
    "apps/api/app/services/insiders.py",
    "apps/web/lib/api.ts",
    "apps/web/lib/etf-holdings-api.ts",
    "apps/web/lib/ipo-insiders-api.ts",
    "apps/web/lib/resilient-fetch.ts",
    "apps/web/next.config.ts",
]

missing = [item for item in REQUIRED if not (ROOT / item).exists()]
if missing:
    print("Fichiers requis absents :")
    for item in missing:
        print(f"- {item}")
    sys.exit(1)

python_files = [
    ROOT / "apps/api/app/api/router.py",
    ROOT / "apps/api/app/api/routes/health.py",
    ROOT / "apps/api/app/services/cockpit.py",
    ROOT / "apps/api/app/services/market_data.py",
    ROOT / "apps/api/app/services/etf.py",
    ROOT / "apps/api/app/services/fundamentals.py",
]
for path in python_files:
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

router = (ROOT / "apps/api/app/api/router.py").read_text(encoding="utf-8")
for module in (
    "discovery",
    "etf_holdings",
    "ipo_insiders",
    "fundamentals",
    "market",
    "search",
):
    if module not in router:
        raise SystemExit(f"Routeur incomplet : {module} n'est pas monté.")

market_data = (ROOT / "apps/api/app/services/market_data.py").read_text(
    encoding="utf-8"
)
if "async def get_history_many" not in market_data:
    raise SystemExit("Le correctif Screener get_history_many est absent.")

cockpit = (ROOT / "apps/api/app/services/cockpit.py").read_text(encoding="utf-8")
if "market_data_service.get_quotes" not in cockpit:
    raise SystemExit("Le Cockpit ne passe pas par le service de secours partagé.")

api_client = (ROOT / "apps/web/lib/api.ts").read_text(encoding="utf-8")
for export_name in (
    "getHealthStatus",
    "getCockpitSnapshot",
    "getWatchlistSnapshot",
    "getFocusSnapshot",
    "getScreenerSnapshot",
    "getNewsSnapshot",
    "getCalendarSnapshot",
    "getPsychologySnapshot",
    "getEtfDirectory",
    "searchSymbols",
    "quoteWebSocketUrl",
):
    if f"export function {export_name}" not in api_client:
        raise SystemExit(f"Export frontend absent : {export_name}")

next_config = (ROOT / "apps/web/next.config.ts").read_text(encoding="utf-8")
if 'source: "/api/anatole/:path*"' not in next_config:
    raise SystemExit("Le relais same-origin Next.js est absent.")

obsolete = ROOT / "apps/web/app/route_anatole_proxy.ts"
if obsolete.exists():
    raise SystemExit(
        "Fichier obsolète encore présent : apps/web/app/route_anatole_proxy.ts"
    )

print("Restauration Anatole : structure et connexions cohérentes.")
