from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "apps/api/app/api/router.py"


def patch_api_router() -> bool:
    if not ROUTER.exists():
        print(f"[SKIP] Router introuvable: {ROUTER}")
        return False

    text = ROUTER.read_text(encoding="utf-8")
    if "provincial_macro.router" in text:
        print("[OK] Route provincial_macro déjà montée.")
        return True

    updated = text

    # Style courant Anatole:
    # from app.api.routes import (
    #     discovery,
    #     ...
    # )
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

    include = """
# Anatole v1.5.0 — province-first macro
api_router.include_router(
    provincial_macro.router,
    prefix="/api/v1/discovery",
    tags=["provincial-macro"],
)
""".strip()

    ws_match = re.search(
        r"\n#.*WebSocket.*?\napi_router\.include_router\(\s*ws\.router,",
        updated,
        flags=re.S | re.I,
    )
    if ws_match:
        updated = updated[: ws_match.start()] + "\n\n" + include + "\n" + updated[ws_match.start() :]
    else:
        updated = updated.rstrip() + "\n\n" + include + "\n"

    if updated == text:
        print("[SKIP] Aucun changement.")
        return False

    ROUTER.write_text(updated, encoding="utf-8")
    print(f"[OK] Route ajoutée dans {ROUTER.relative_to(ROOT)}")
    return True


if __name__ == "__main__":
    patch_api_router()
    print("\nEnsuite: intégrer ProvinceMacroFeed dans les pages Actualités et Calendrier.")
    print("Lire FRONTEND_INTEGRATION_V1_5_0.md.")
