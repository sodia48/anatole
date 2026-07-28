from pathlib import Path
import py_compile

ROOT = Path(__file__).resolve().parent
required = [
    "apps/api/app/api/routes/workspace.py",
    "apps/api/app/schemas/workspace.py",
    "apps/api/app/services/portfolio.py",
    "apps/api/app/services/alerts.py",
    "apps/api/app/services/assistant.py",
    "apps/api/app/services/data_quality.py",
    "apps/web/app/portefeuille/page.tsx",
    "apps/web/app/alertes/page.tsx",
    "apps/web/app/assistant/page.tsx",
    "apps/web/app/qualite/page.tsx",
    "apps/web/components/workspace/PortfolioClient.tsx",
    "apps/web/components/workspace/AlertsClient.tsx",
    "apps/web/components/workspace/AssistantClient.tsx",
    "apps/web/components/workspace/DataQualityClient.tsx",
]
missing = [item for item in required if not (ROOT / item).exists()]
if missing:
    raise SystemExit(f"Fichiers manquants: {missing}")
for file in (ROOT / "apps/api/app").rglob("*.py"):
    py_compile.compile(str(file), doraise=True)
print("Anatole v0.7: fichiers présents et Python valide.")
