from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "apps/api/app/api/router.py"
WEB_ROOT = ROOT / "apps/web"
BACKUP_ROOT = ROOT / ".anatole-backups/v1_5_1"

IMPORT_LINE = (
    'import ProvinceCalendarPriorityPanel from '
    '"@/components/provincial/ProvinceCalendarPriorityPanel";'
)
MARKER = "ANATOLE_V1_5_1_PROVINCIAL_CALENDAR_PRIORITY"


def backup(path: Path) -> None:
    rel = path.relative_to(ROOT)
    target = BACKUP_ROOT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        shutil.copy2(path, target)


def patch_api_router() -> bool:
    if not ROUTER.exists():
        print(f"[ERROR] Router FastAPI introuvable: {ROUTER}")
        return False

    text = ROUTER.read_text(encoding="utf-8")
    if "provincial_macro.router" in text:
        print("[OK] Route provincial_macro déjà montée dans FastAPI.")
        return True

    backup(ROUTER)
    updated = text

    block = re.search(
        r"from\s+app\.api\.routes\s+import\s+\(\s*(?P<body>.*?)\n\)",
        updated,
        flags=re.S,
    )
    if block and "provincial_macro" not in block.group("body"):
        body = block.group("body")
        replacement = block.group(0).replace(
            body,
            body.rstrip() + "\n    provincial_macro,",
        )
        updated = updated[: block.start()] + replacement + updated[block.end() :]
    elif "from app.api.routes import provincial_macro" not in updated:
        updated = "from app.api.routes import provincial_macro\n" + updated

    include = '''
# Anatole v1.5.1 — calendrier provincial prioritaire
api_router.include_router(
    provincial_macro.router,
    prefix="/api/v1/discovery",
    tags=["provincial-macro"],
)
'''.strip()

    ws_match = re.search(
        r"\n#.*WebSocket.*?\napi_router\.include_router\(\s*ws\.router,",
        updated,
        flags=re.S | re.I,
    )
    if ws_match:
        updated = (
            updated[: ws_match.start()]
            + "\n\n"
            + include
            + "\n"
            + updated[ws_match.start() :]
        )
    else:
        updated = updated.rstrip() + "\n\n" + include + "\n"

    ROUTER.write_text(updated, encoding="utf-8")
    print(f"[OK] Route ajoutée: {ROUTER.relative_to(ROOT)}")
    return True


def region_variable(text: str) -> tuple[str | None, int]:
    patterns = [
        r"const\s*\[\s*([A-Za-z_$][\w$]*(?:Region|region)[\w$]*)\s*,\s*[A-Za-z_$][\w$]*\s*\]\s*=\s*useState",
        r"const\s*\[\s*(selectedRegion|region|regionFilter)\s*,\s*[A-Za-z_$][\w$]*\s*\]",
        r"<select[^>]+value=\{\s*([A-Za-z_$][\w$]*(?:Region|region)[\w$]*)\s*\}",
        r"value=\{\s*(selectedRegion|region|regionFilter)\s*\}",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.S)
        if match:
            return match.group(1), match.start()
    return None, -1


def candidate_score(path: Path, text: str) -> int:
    low_path = str(path).lower()
    score = 0
    if "calendrier" in low_path or "calendar" in low_path:
        score += 14
    if "getCalendarSnapshot" in text or "getEconomicCalendarSnapshot" in text:
        score += 12
    if re.search(r"r[ée]gion|region", text, flags=re.I):
        score += 5
    if "importance" in text.lower():
        score += 2
    if "catégorie" in text.lower() or "category" in text.lower():
        score += 2
    variable, _ = region_variable(text)
    if variable:
        score += 9
    if "ProvinceCalendarPriorityPanel" in text:
        score += 100
    return score


def find_calendar_client() -> tuple[Path | None, str | None]:
    if not WEB_ROOT.exists():
        return None, None

    candidates: list[tuple[int, Path, str]] = []
    for path in WEB_ROOT.rglob("*.tsx"):
        if any(part in {"node_modules", ".next"} for part in path.parts):
            continue
        if path.name in {"ProvinceCalendarPriorityPanel.tsx", "ProvinceMacroFeed.tsx"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        score = candidate_score(path, text)
        if score >= 18:
            candidates.append((score, path, text))

    if not candidates:
        return None, None

    candidates.sort(key=lambda item: (-item[0], len(str(item[1]))))
    top = candidates[0]
    print("[INFO] Candidats Calendrier détectés:")
    for score, path, _ in candidates[:5]:
        print(f"       score={score:02d}  {path.relative_to(ROOT)}")
    return top[1], top[2]


def add_import(text: str) -> str:
    if "ProvinceCalendarPriorityPanel" in text and IMPORT_LINE in text:
        return text

    use_client = re.match(r'^(\s*[\"\']use client[\"\'];?\s*\n)', text)
    if use_client:
        pos = use_client.end()
        return text[:pos] + "\n" + IMPORT_LINE + "\n" + text[pos:]
    return IMPORT_LINE + "\n" + text


def inject_panel(text: str, variable: str, search_from: int) -> str | None:
    if MARKER in text or "<ProvinceCalendarPriorityPanel" in text:
        return text

    return_match = re.search(r"\breturn\s*\(", text[max(0, search_from):])
    if not return_match:
        return None
    return_pos = max(0, search_from) + return_match.end()

    # Fragment root: return ( <> ...
    fragment = re.match(r"\s*<>", text[return_pos:])
    if fragment:
        pos = return_pos + fragment.end()
    else:
        # Normal JSX root. Keep the regex bounded so we don't jump into a later helper.
        segment = text[return_pos : return_pos + 1200]
        opening = re.match(r"\s*<([A-Za-z][A-Za-z0-9_.-]*)(?:\s[^<>]*?)?>", segment)
        if not opening:
            return None
        pos = return_pos + opening.end()

    injection = (
        f"\n      {{/* {MARKER} */}}\n"
        f"      <ProvinceCalendarPriorityPanel region={{String({variable} ?? \"\")}} />\n"
    )
    return text[:pos] + injection + text[pos:]


def patch_calendar_client() -> bool:
    path, text = find_calendar_client()
    if path is None or text is None:
        print(
            "[ERROR] Impossible d'identifier automatiquement le composant Next.js du Calendrier.\n"
            "        Aucun fichier n'a été modifié au hasard."
        )
        return False

    if MARKER in text or "<ProvinceCalendarPriorityPanel" in text:
        print(f"[OK] Panneau provincial déjà intégré: {path.relative_to(ROOT)}")
        return True

    variable, variable_pos = region_variable(text)
    if not variable:
        print(
            f"[ERROR] Le composant {path.relative_to(ROOT)} a été trouvé, "
            "mais la variable du filtre Région n'a pas été reconnue."
        )
        return False

    backup(path)
    updated = add_import(text)
    # Import insertion changes offsets; locate the variable again.
    _, new_variable_pos = region_variable(updated)
    injected = inject_panel(updated, variable, new_variable_pos)
    if injected is None:
        print(
            f"[ERROR] Injection JSX impossible dans {path.relative_to(ROOT)}. "
            "La sauvegarde a été créée; le fichier original reste inchangé."
        )
        return False

    path.write_text(injected, encoding="utf-8")
    print(
        f"[OK] Calendrier connecté automatiquement au fil provincial: "
        f"{path.relative_to(ROOT)} (filtre={variable})"
    )
    return True


def verify_required_files() -> bool:
    required = [
        ROOT / "apps/api/app/services/provincial_macro.py",
        ROOT / "apps/api/app/schemas/provincial_macro.py",
        ROOT / "apps/api/app/api/routes/provincial_macro.py",
        ROOT / "apps/web/lib/provincial-macro.ts",
        ROOT / "apps/web/components/provincial/ProvinceCalendarPriorityPanel.tsx",
        ROOT / "apps/web/components/provincial/ProvinceCalendarPriorityPanel.module.css",
    ]
    missing = [path for path in required if not path.exists()]
    if missing:
        for path in missing:
            print(f"[ERROR] Fichier manquant: {path.relative_to(ROOT)}")
        return False
    return True


def main() -> int:
    print("Anatole v1.5.1 — installation Calendrier provincial prioritaire\n")
    if not verify_required_files():
        return 2

    api_ok = patch_api_router()
    web_ok = patch_calendar_client()

    print(f"\nSauvegardes: {BACKUP_ROOT.relative_to(ROOT)}")
    if api_ok and web_ok:
        print("[SUCCESS] Backend + Calendrier Next.js reliés.")
        print("Déployer Render d'abord, puis Vercel sans réutiliser l'ancien Build Cache.")
        return 0

    print("[FAIL] Installation incomplète. Ne déployez pas avant d'avoir corrigé les erreurs ci-dessus.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
