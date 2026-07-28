from pathlib import Path
import py_compile

ROOT = Path(__file__).resolve().parent
required = [
    "apps/api/app/api/routes/analysis.py",
    "apps/api/app/schemas/analysis.py",
    "apps/api/app/services/analysis.py",
    "apps/web/app/comparateur/page.tsx",
    "apps/web/app/terminal/page.tsx",
    "apps/web/components/analysis/ComparatorClient.tsx",
    "apps/web/components/analysis/TerminalClient.tsx",
]
missing = [item for item in required if not (ROOT / item).exists()]
if missing:
    raise SystemExit(f"Fichiers manquants: {missing}")
for file in (ROOT / "apps/api/app").rglob("*.py"):
    py_compile.compile(str(file), doraise=True)
print("Anatole v0.6: fichiers présents et Python valide.")
