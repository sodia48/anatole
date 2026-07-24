from __future__ import annotations

from pathlib import Path
import re
import shutil
import sys


FILES = (
    Path("components/layout/AppSidebar.tsx"),
    Path("apps/web/components/layout/AppSidebar.tsx"),
)

ENTRY_PATTERN = re.compile(
    r'\{\s*href\s*:\s*["\']/roadmap\#ipo["\']\s*,\s*'
    r'label\s*:\s*["\']IPO\s*&\s*insiders["\']\s*,\s*'
    r'icon\s*:\s*Database\s*,\s*'
    r'available\s*:\s*false\s*\}'
)

REPLACEMENT = (
    '{ href: "/ipo-insiders", label: "IPO & insiders", '
    'icon: Database, available: true }'
)


def patch_file(path: Path) -> bool:
    if not path.exists():
        print(f"[IGNORÉ] Fichier absent : {path}")
        return False

    source = path.read_text(encoding="utf-8")

    already_correct = (
        re.search(
            r'href\s*:\s*["\']/ipo-insiders["\']'
            r'[\s\S]{0,160}?'
            r'label\s*:\s*["\']IPO\s*&\s*insiders["\']'
            r'[\s\S]{0,160}?'
            r'available\s*:\s*true',
            source,
        )
        is not None
    )

    if already_correct:
        print(f"[OK] Déjà corrigé : {path}")
        return True

    corrected, count = ENTRY_PATTERN.subn(REPLACEMENT, source, count=1)

    if count != 1:
        print(
            f"[ERREUR] Entrée exacte non trouvée dans {path}. "
            "Aucune autre ligne n'a été modifiée."
        )
        return False

    backup = path.with_suffix(path.suffix + ".bak")
    shutil.copy2(path, backup)
    path.write_text(corrected, encoding="utf-8")

    final_source = path.read_text(encoding="utf-8")
    valid = (
        'href: "/ipo-insiders"' in final_source
        and 'label: "IPO & insiders"' in final_source
        and "available: true" in final_source
    )

    if not valid:
        shutil.copy2(backup, path)
        print(f"[ERREUR] Validation échouée, restauration : {path}")
        return False

    print(f"[CORRIGÉ] {path}")
    print(f"           Sauvegarde : {backup}")
    return True


def main() -> int:
    results = [patch_file(path) for path in FILES]

    if not any(results):
        print(
            "\nAucun fichier n'a été corrigé. Lance ce script depuis "
            "la racine du dépôt Anatole."
        )
        return 1

    print(
        "\nCorrection terminée. Le bouton IPO & insiders pointe maintenant "
        "vers /ipo-insiders et n'est plus marqué BIENTÔT."
    )
    return 0 if all(results) else 2


if __name__ == "__main__":
    sys.exit(main())
