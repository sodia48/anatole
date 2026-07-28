from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent

REQUIRED = [
    "apps/api/app/api/router.py",
    "apps/api/app/api/routes/discovery.py",
    "apps/api/app/api/routes/fundamentals.py",
    "apps/api/app/api/routes/market.py",
    "apps/api/app/api/routes/search.py",
    "apps/api/app/services/etf_holdings_service.py",
    "apps/api/app/services/ipo_service.py",
    "apps/api/app/services/insiders_service.py",
    "apps/web/lib/api.ts",
    "apps/web/lib/etf-holdings-api.ts",
    "apps/web/lib/ipo-insiders-api.ts",
]

missing = [item for item in REQUIRED if not (ROOT / item).exists()]

if missing:
    print("Fichiers requis absents :")
    for item in missing:
        print(f"- {item}")
    sys.exit(1)

router = (ROOT / "apps/api/app/api/router.py").read_text(encoding="utf-8")
for module in ("discovery", "fundamentals", "market", "search"):
    if module not in router:
        raise SystemExit(f"Routeur incomplet : {module} n'est pas monté.")

for file_name in (
    "apps/web/lib/etf-holdings-api.ts",
    "apps/web/lib/ipo-insiders-api.ts",
):
    content = (ROOT / file_name).read_text(encoding="utf-8")
    if "/api/anatole" in content:
        raise SystemExit(f"Ancien relais encore utilisé dans {file_name}.")

print("Restauration Anatole : structure cohérente.")
