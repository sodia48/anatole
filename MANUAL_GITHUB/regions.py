from __future__ import annotations

import re
import unicodedata

CANADA = "CA"
PROVINCE_CODES = (
    "QC", "ON", "BC", "AB", "SK",
    "MB", "NB", "NS", "PE", "NL",
)
ALL_CANADIAN_REGIONS = (CANADA, *PROVINCE_CODES)

_REGION_ALIASES: dict[str, tuple[str, ...]] = {
    "QC": (
        "quebec", "québec",
    ),
    "ON": (
        "ontario",
    ),
    "BC": (
        "british columbia", "b.c.", "b.c", "colombie-britannique",
    ),
    "AB": (
        "alberta",
    ),
    "SK": (
        "saskatchewan",
    ),
    "MB": (
        "manitoba",
    ),
    "NB": (
        "new brunswick", "nouveau-brunswick", "n.b.", "n.-b.",
    ),
    "NS": (
        "nova scotia", "nouvelle-ecosse", "nouvelle-écosse", "n.s.", "n.-e.",
    ),
    "PE": (
        "prince edward island", "p.e.i.", "pei",
        "ile-du-prince-edouard", "île-du-prince-édouard", "i.-p.-e.",
    ),
    "NL": (
        "newfoundland and labrador", "newfoundland & labrador",
        "terre-neuve-et-labrador", "terre neuve et labrador", "n.l.", "t.-n.-l.",
    ),
}

# Releases in these families routinely contain provincial tables/series even
# when the headline is national. They should remain visible inside a province
# view in Anatole.
_PROVINCIAL_BREAKDOWN_PATTERNS = (
    "labour force survey",
    "enquete sur la population active",
    "consumer price index",
    "indice des prix a la consommation",
    "retail trade",
    "commerce de detail",
    "wholesale trade",
    "commerce de gros",
    "building permits",
    "permis de batir",
    "manufacturing sales",
    "monthly survey of manufacturing",
    "enquete mensuelle sur les industries manufacturieres",
    "payroll employment",
    "emploi salarie",
    "job vacancies",
    "postes vacants",
    "investment in building construction",
    "investissement en construction de batiments",
    "new housing price index",
    "indice des prix des logements neufs",
    "population estimates",
    "estimations demographiques",
    "gross domestic product by industry: provinces",
    "produit interieur brut par industrie : provinces",
    "provincial and territorial economic accounts",
    "comptes economiques provinciaux et territoriaux",
)


def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", ascii_text).strip()


def explicit_regions(text: str) -> list[str]:
    folded = _fold(text)
    searchable = re.sub(r"[^a-z0-9]+", " ", folded).strip()
    padded = f" {searchable} "
    regions: list[str] = []

    for code in PROVINCE_CODES:
        aliases = _REGION_ALIASES[code]
        for alias in aliases:
            alias_folded = _fold(alias)
            alias_searchable = re.sub(
                r"[^a-z0-9]+",
                " ",
                alias_folded,
            ).strip()
            if alias_searchable and f" {alias_searchable} " in padded:
                regions.append(code)
                break

    return regions


def economic_regions(text: str) -> list[str]:
    explicit = explicit_regions(text)
    if explicit:
        return explicit

    folded = _fold(text)
    if any(pattern in folded for pattern in _PROVINCIAL_BREAKDOWN_PATTERNS):
        return list(ALL_CANADIAN_REGIONS)

    return [CANADA]


def province_region(code: str) -> list[str]:
    return [code] if code in PROVINCE_CODES else [CANADA]
