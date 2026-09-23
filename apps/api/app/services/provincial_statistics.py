from __future__ import annotations

import asyncio
import csv
import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Iterable

import httpx

from app.schemas.provincial_statistics import (
    ProvincialMetric,
    ProvincialMetricPoint,
    ProvincialProfile,
    ProvincialStatisticsSnapshot,
    ProvincialStatisticsSourceStatus,
)


WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"
RETAIL_SALES_CSV_URL = "https://www150.statcan.gc.ca/n1/tbl/csv/20100056-eng.zip"
RETAIL_SALES_CSV_NAME = "20100056.csv"
RETAIL_SALES_CACHE_SECONDS = 1800.0

CPI_ALL_ITEMS_VECTOR_BY_CODE: dict[str, int] = {
    "CA": 41690973,
    "NL": 41691244,
    "PE": 41691379,
    "NS": 41691513,
    "NB": 41691648,
    "QC": 41691783,
    "ON": 41691919,
    "MB": 41692055,
    "SK": 41692191,
    "AB": 41692327,
    "BC": 41692462,
}

CACHE_SECONDS = 1800.0
METADATA_CACHE_SECONDS = 86_400.0

PROVINCES: tuple[dict[str, str], ...] = (
    {
        "code": "NL",
        "fr": "Terre-Neuve-et-Labrador",
        "en": "Newfoundland and Labrador",
        "source_name_fr": "Newfoundland & Labrador Statistics Agency",
        "source_name_en": "Newfoundland & Labrador Statistics Agency",
        "source_url": "https://www.gov.nl.ca/fin/economics/",
    },
    {
        "code": "PE",
        "fr": "Île-du-Prince-Édouard",
        "en": "Prince Edward Island",
        "source_name_fr": "PEI Statistics Bureau",
        "source_name_en": "PEI Statistics Bureau",
        "source_url": "https://www.princeedwardisland.ca/en/topic/statistics",
    },
    {
        "code": "NS",
        "fr": "Nouvelle-Écosse",
        "en": "Nova Scotia",
        "source_name_fr": "Nova Scotia Statistics",
        "source_name_en": "Nova Scotia Statistics",
        "source_url": "https://novascotia.ca/finance/statistics/",
    },
    {
        "code": "NB",
        "fr": "Nouveau-Brunswick",
        "en": "New Brunswick",
        "source_name_fr": "Gouvernement du Nouveau-Brunswick — Statistiques",
        "source_name_en": "Government of New Brunswick — Statistics",
        "source_url": "https://www2.gnb.ca/content/gnb/en/departments/finance/statistics.html",
    },
    {
        "code": "QC",
        "fr": "Québec",
        "en": "Quebec",
        "source_name_fr": "Institut de la statistique du Québec",
        "source_name_en": "Institut de la statistique du Québec",
        "source_url": "https://statistique.quebec.ca/",
    },
    {
        "code": "ON",
        "fr": "Ontario",
        "en": "Ontario",
        "source_name_fr": "Ontario — Comptes économiques",
        "source_name_en": "Ontario Economic Accounts",
        "source_url": "https://www.ontario.ca/page/ontario-economic-accounts",
    },
    {
        "code": "MB",
        "fr": "Manitoba",
        "en": "Manitoba",
        "source_name_fr": "Manitoba Bureau of Statistics",
        "source_name_en": "Manitoba Bureau of Statistics",
        "source_url": "https://www.gov.mb.ca/mbs/",
    },
    {
        "code": "SK",
        "fr": "Saskatchewan",
        "en": "Saskatchewan",
        "source_name_fr": "Saskatchewan Bureau of Statistics",
        "source_name_en": "Saskatchewan Bureau of Statistics",
        "source_url": "https://www.saskatchewan.ca/government/government-data/bureau-of-statistics",
    },
    {
        "code": "AB",
        "fr": "Alberta",
        "en": "Alberta",
        "source_name_fr": "Alberta Economic Dashboard",
        "source_name_en": "Alberta Economic Dashboard",
        "source_url": "https://economicdashboard.alberta.ca/",
    },
    {
        "code": "BC",
        "fr": "Colombie-Britannique",
        "en": "British Columbia",
        "source_name_fr": "BC Stats",
        "source_name_en": "BC Stats",
        "source_url": "https://www2.gov.bc.ca/gov/content/data/statistics",
    },
)

PROVINCE_BY_CODE = {item["code"]: item for item in PROVINCES}


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


REGION_ALIASES: dict[str, str] = {
    "nl": "NL",
    "newfoundland": "NL",
    "newfoundland and labrador": "NL",
    "terre neuve et labrador": "NL",
    "pe": "PE",
    "pei": "PE",
    "prince edward island": "PE",
    "ile du prince edouard": "PE",
    "ns": "NS",
    "nova scotia": "NS",
    "nouvelle ecosse": "NS",
    "nb": "NB",
    "new brunswick": "NB",
    "nouveau brunswick": "NB",
    "qc": "QC",
    "pq": "QC",
    "quebec": "QC",
    "on": "ON",
    "ontario": "ON",
    "mb": "MB",
    "manitoba": "MB",
    "sk": "SK",
    "saskatchewan": "SK",
    "ab": "AB",
    "alberta": "AB",
    "bc": "BC",
    "british columbia": "BC",
    "colombie britannique": "BC",
}


def normalize_region(value: str | None) -> str:
    clean = _norm(value or "")
    if clean in {"", "all", "toutes", "tous", "all regions", "all provinces"}:
        return "ALL"
    if clean in {"canada", "ca"}:
        return "ALL"
    upper = str(value or "").strip().upper()
    if upper in PROVINCE_BY_CODE:
        return upper
    return REGION_ALIASES.get(clean, "ALL")


@dataclass(frozen=True, slots=True)
class Selector:
    dimension_terms: tuple[str, ...]
    member_terms: tuple[str, ...]
    required: bool = True


@dataclass(frozen=True, slots=True)
class MetricSpec:
    key: str
    label_fr: str
    label_en: str
    category_fr: str
    category_en: str
    product_id: int
    table_id: str
    simple_view_pid: str
    unit_kind: str
    change_kind: str
    latest_n: int
    selectors: tuple[Selector, ...]


def _selector(
    dimensions: Iterable[str],
    members: Iterable[str],
    *,
    required: bool = True,
) -> Selector:
    return Selector(tuple(dimensions), tuple(members), required)


def _labour_selectors(
    characteristic_members: Iterable[str],
) -> tuple[Selector, ...]:
    """Resolve the LFS view by dimension name, never by position.

    Table 14-10-0287-03 currently exposes six dimensions.  Statistics and
    data type remain optional so that an official metadata view which omits
    either dimension can still be resolved without inventing a coordinate.
    """
    return (
        _selector(
            (
                "labour force characteristics",
                "caracteristiques de la population active",
            ),
            characteristic_members,
        ),
        _selector(
            ("gender", "sex", "genre", "sexe"),
            (
                "total - gender",
                "total - genre",
                "both genders",
                "both sexes",
                "les deux sexes",
                "tous les genres",
            ),
        ),
        _selector(
            ("age group", "age", "groupe d age"),
            ("15 years and over", "15 ans et plus"),
        ),
        _selector(
            ("statistics", "statistic", "statistiques", "statistique"),
            ("estimate", "estimation"),
            required=False,
        ),
        _selector(
            (
                "data type",
                "type de donnees",
                "seasonal adjustment",
                "desaisonnalisation",
            ),
            (
                "seasonally adjusted",
                "seasonally adjusted estimates",
                "desaisonnalise",
                "donnees desaisonnalisees",
                "estimations desaisonnalisees",
            ),
            required=False,
        ),
    )


METRICS: tuple[MetricSpec, ...] = (
    MetricSpec(
        key="inflation_yoy",
        label_fr="Inflation sur 12 mois",
        label_en="12-month inflation",
        category_fr="Prix",
        category_en="Prices",
        product_id=18100004,
        table_id="18-10-0004-01",
        simple_view_pid="1810000401",
        unit_kind="percent",
        change_kind="points",
        latest_n=14,
        selectors=(
            _selector(
                ("product", "produit"),
                (
                    "all items",
                    "all-items",
                    "ensemble",
                    "indice d ensemble",
                ),
            ),
        ),
    ),
    MetricSpec(
        key="unemployment_rate",
        label_fr="Taux de chômage",
        label_en="Unemployment rate",
        category_fr="Travail",
        category_en="Labour",
        product_id=14100287,
        table_id="14-10-0287-03",
        simple_view_pid="1410028703",
        unit_kind="percent",
        change_kind="points",
        latest_n=13,
        selectors=_labour_selectors(
            ("unemployment rate", "taux de chomage"),
        ),
    ),
    MetricSpec(
        key="employment",
        label_fr="Emploi",
        label_en="Employment",
        category_fr="Travail",
        category_en="Labour",
        product_id=14100287,
        table_id="14-10-0287-03",
        simple_view_pid="1410028703",
        unit_kind="persons",
        change_kind="percent",
        latest_n=13,
        selectors=_labour_selectors(("employment", "emploi")),
    ),
    MetricSpec(
        key="population",
        label_fr="Population",
        label_en="Population",
        category_fr="Démographie",
        category_en="Demography",
        product_id=17100009,
        table_id="17-10-0009-01",
        simple_view_pid="1710000901",
        unit_kind="persons",
        change_kind="percent",
        latest_n=9,
        selectors=(),
    ),
    MetricSpec(
        key="real_gdp",
        label_fr="PIB réel",
        label_en="Real GDP",
        category_fr="Activité",
        category_en="Activity",
        product_id=36100222,
        table_id="36-10-0222-01",
        simple_view_pid="3610022201",
        unit_kind="currency",
        change_kind="percent",
        latest_n=6,
        selectors=(
            _selector(
                ("estimates", "estimations"),
                (
                    "gross domestic product at market prices",
                    "produit interieur brut aux prix du marche",
                ),
            ),
            _selector(
                ("prices", "prix"),
                (
                    "chained 2017 dollars",
                    "2017 chained dollars",
                    "chained (2017) dollars",
                    "dollars enchaines de 2017",
                    "dollars de 2017 enchaines",
                ),
            ),
        ),
    ),
    MetricSpec(
        key="retail_sales",
        label_fr="Ventes au détail",
        label_en="Retail sales",
        category_fr="Consommation",
        category_en="Consumption",
        product_id=20100056,
        table_id="20-10-0056-01",
        simple_view_pid="2010005601",
        unit_kind="currency",
        change_kind="percent",
        latest_n=2,
        selectors=(
            _selector(
                (
                    "north american industry classification system",
                    "naics",
                    "systeme de classification des industries de l amerique du nord",
                    "scian",
                    "industry",
                    "industrie",
                ),
                (
                    "retail trade",
                    "commerce de detail",
                    "total retail",
                    "retail trade 44 45",
                ),
            ),
            _selector(
                ("sales", "ventes"),
                (
                    "total retail sales",
                    "retail sales",
                    "ventes au detail totales",
                    "ventes au detail",
                ),
            ),
            _selector(
                ("adjustments", "adjustment", "ajustements", "ajustement"),
                (
                    "seasonally adjusted",
                    "desaisonnalise",
                    "donnees desaisonnalisees",
                ),
            ),
        ),
    ),
    MetricSpec(
        key="housing_starts",
        label_fr="Mises en chantier",
        label_en="Housing starts",
        category_fr="Logement",
        category_en="Housing",
        product_id=34100158,
        table_id="34-10-0158-01",
        simple_view_pid="3410015801",
        unit_kind="units",
        change_kind="percent",
        latest_n=13,
        selectors=(
            _selector(
                ("housing starts", "mises en chantier", "type"),
                ("total", "all areas", "toutes les regions"),
                required=False,
            ),
        ),
    ),
)


@dataclass(slots=True)
class _CachedMetadata:
    value: dict[str, Any]
    stored_at: float


def _language(value: str | None) -> str:
    return "en" if str(value or "").strip().lower().startswith("en") else "fr"


def _label(value: dict[str, Any], lang: str) -> str:
    primary = value.get("memberNameEn" if lang == "en" else "memberNameFr")
    secondary = value.get("memberNameFr" if lang == "en" else "memberNameEn")
    return str(primary or secondary or "")


def _dimension_name(value: dict[str, Any], lang: str) -> str:
    primary = value.get("dimensionNameEn" if lang == "en" else "dimensionNameFr")
    secondary = value.get("dimensionNameFr" if lang == "en" else "dimensionNameEn")
    return str(primary or secondary or "")


def _active_members(dimension: dict[str, Any]) -> list[dict[str, Any]]:
    values = dimension.get("member") or dimension.get("members") or []
    return [
        member
        for member in values
        if isinstance(member, dict)
        and int(member.get("terminated") or 0) == 0
    ]


def _contains_any(value: str, terms: Iterable[str]) -> bool:
    clean = _norm(value)
    return any(_norm(term) in clean for term in terms if _norm(term))


def _find_dimension(
    dimensions: list[dict[str, Any]],
    terms: Iterable[str],
) -> dict[str, Any] | None:
    for dimension in dimensions:
        names = (
            str(dimension.get("dimensionNameEn") or ""),
            str(dimension.get("dimensionNameFr") or ""),
        )
        if any(_contains_any(name, terms) for name in names):
            return dimension
    return None


def _find_member(
    dimension: dict[str, Any],
    terms: Iterable[str],
) -> dict[str, Any] | None:
    candidates = _active_members(dimension)
    normalized_terms = [_norm(term) for term in terms if _norm(term)]
    if not normalized_terms:
        return None

    scored: list[tuple[int, int, dict[str, Any]]] = []
    for member in candidates:
        names = [
            _norm(member.get("memberNameEn")),
            _norm(member.get("memberNameFr")),
        ]
        best = -1
        for term in normalized_terms:
            for name in names:
                if name == term:
                    best = max(best, 1000 + len(term))
                elif term in name:
                    best = max(best, 500 + len(term))
        if best >= 0:
            scored.append((best, -int(member.get("memberId") or 0), member))
    if not scored:
        return None
    scored.sort(reverse=True, key=lambda item: (item[0], item[1]))
    return scored[0][2]


SAFE_DEFAULT_MEMBER_TERMS = (
    "total",
    "all industries",
    "all types",
    "all persons",
    "both sexes",
    "15 years and over",
    "all ages",
    "all items",
    "seasonally adjusted",
    "number",
    "value",
    "population",
)


def _safe_default_member(dimension: dict[str, Any]) -> dict[str, Any] | None:
    active = _active_members(dimension)
    if len(active) == 1:
        return active[0]
    return _find_member(dimension, SAFE_DEFAULT_MEMBER_TERMS)


def _geography_member(
    dimensions: list[dict[str, Any]],
    province: dict[str, str],
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    dimension = _find_dimension(dimensions, ("geography", "geographie"))
    if dimension is None:
        return None
    member = _find_member(
        dimension,
        (province["en"], province["fr"], province["code"]),
    )
    if member is None:
        return None
    return dimension, member


def _resolve_coordinate(
    metadata: dict[str, Any],
    spec: MetricSpec,
    province: dict[str, str],
) -> str | None:
    dimensions = metadata.get("dimension") or metadata.get("dimensions") or []
    dimensions = [item for item in dimensions if isinstance(item, dict)]
    if not dimensions:
        return None

    selected: dict[int, int] = {}
    geo = _geography_member(dimensions, province)
    if geo is None:
        return None
    geo_dimension, geo_member = geo
    selected[int(geo_dimension.get("dimensionPositionId") or 1)] = int(
        geo_member.get("memberId") or 0
    )

    explicitly_handled: set[int] = {int(geo_dimension.get("dimensionPositionId") or 1)}

    for selector in spec.selectors:
        dimension = _find_dimension(dimensions, selector.dimension_terms)
        if dimension is None:
            if selector.required:
                return None
            continue
        pos = int(dimension.get("dimensionPositionId") or 0)
        explicitly_handled.add(pos)
        member = _find_member(dimension, selector.member_terms)
        if member is None:
            if selector.required:
                return None
            continue
        selected[pos] = int(member.get("memberId") or 0)

    for dimension in dimensions:
        pos = int(dimension.get("dimensionPositionId") or 0)
        if pos <= 0 or pos in selected:
            continue
        member = _safe_default_member(dimension)
        if member is None:
            return None
        selected[pos] = int(member.get("memberId") or 0)

    coordinate = [0] * 10
    for position, member_id in selected.items():
        if 1 <= position <= 10:
            coordinate[position - 1] = member_id
    return ".".join(str(value) for value in coordinate)


def _unwrap(response: Any) -> Any:
    if isinstance(response, dict) and "object" in response:
        return response.get("object")
    return response


def _point_list(item: Any) -> list[dict[str, Any]]:
    item = _unwrap(item)
    if isinstance(item, dict):
        direct = item.get("vectorDataPoint")
        if isinstance(direct, list):
            return [point for point in direct if isinstance(point, dict)]
        for key in ("data", "points", "series"):
            value = item.get(key)
            if isinstance(value, list):
                points = [point for point in value if isinstance(point, dict) and "value" in point]
                if points:
                    return points
    return []


def _scaled_value(point: dict[str, Any]) -> float | None:
    raw = point.get("value")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    try:
        scalar = int(point.get("scalarFactorCode") or 0)
    except (TypeError, ValueError):
        scalar = 0
    scalar = max(0, min(9, scalar))
    return value * (10**scalar)


def _sort_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(point: dict[str, Any]) -> str:
        return str(
            point.get("refPer")
            or point.get("refPerRaw")
            or point.get("releaseTime")
            or ""
        )
    return sorted(points, key=key)


def _history_from_points(
    points: list[dict[str, Any]],
    *,
    limit: int = 12,
) -> list[ProvincialMetricPoint]:
    output: list[ProvincialMetricPoint] = []
    for point in _sort_points(points)[-limit:]:
        value = _scaled_value(point)
        period = str(
            point.get("refPerRaw")
            or point.get("refPer")
            or ""
        ).strip()
        if value is None or not period:
            continue
        output.append(
            ProvincialMetricPoint(
                period=period,
                value=value,
            )
        )
    return output


def _inflation_yoy_history(
    points: list[dict[str, Any]],
    *,
    limit: int = 12,
) -> list[ProvincialMetricPoint]:
    ordered = _sort_points(points)
    output: list[ProvincialMetricPoint] = []

    for index in range(12, len(ordered)):
        current = _scaled_value(ordered[index])
        year_ago = _scaled_value(ordered[index - 12])
        period = str(
            ordered[index].get("refPerRaw")
            or ordered[index].get("refPer")
            or ""
        ).strip()
        if current is None or year_ago in (None, 0) or not period:
            continue
        output.append(
            ProvincialMetricPoint(
                period=period,
                value=(current / year_ago - 1.0) * 100.0,
            )
        )

    return output[-limit:]


def _change(
    current: float | None,
    previous: float | None,
    mode: str,
) -> float | None:
    if current is None or previous is None:
        return None
    if mode == "percent":
        if previous == 0:
            return None
        return (current / previous - 1.0) * 100.0
    return current - previous


def _inflation_yoy_pair(
    points: list[dict[str, Any]],
) -> tuple[float | None, float | None]:
    ordered = _sort_points(points)
    if len(ordered) < 13:
        return None, None

    current_index = _scaled_value(ordered[-1])
    year_ago_index = _scaled_value(ordered[-13])
    if current_index is None or year_ago_index in (None, 0):
        return None, None

    current = (current_index / year_ago_index - 1.0) * 100.0

    previous = None
    if len(ordered) >= 14:
        previous_index = _scaled_value(ordered[-2])
        previous_year_index = _scaled_value(ordered[-14])
        if previous_index is not None and previous_year_index not in (None, 0):
            previous = (previous_index / previous_year_index - 1.0) * 100.0

    return current, previous



def _response_vector_id(response: Any) -> int | None:
    value = _unwrap(response)
    if not isinstance(value, dict):
        return None
    raw = value.get("vectorId")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _response_coordinate(response: Any) -> str | None:
    value = _unwrap(response)
    if not isinstance(value, dict):
        return None
    coordinate = str(value.get("coordinate") or "").strip()
    return coordinate or None


def _responses_by_code(
    responses: list[Any],
    coordinate_to_code: dict[str, str],
) -> dict[str, Any]:
    # L'ordre des réponses groupées WDS n'est pas utilisé : chaque réponse
    # est reliée à la province grâce à sa coordonnée explicite.
    matched: dict[str, Any] = {}
    for response in responses:
        coordinate = _response_coordinate(response)
        if coordinate is None:
            continue
        code = coordinate_to_code.get(coordinate)
        if code is None:
            continue
        matched[code] = response
    return matched


def _retail_scalar_multiplier(row: dict[str, str]) -> float:
    scalar = _norm(row.get("SCALAR_FACTOR"))
    if "billion" in scalar or "milliard" in scalar:
        return 1_000_000_000.0
    if "million" in scalar:
        return 1_000_000.0
    if "thousand" in scalar or "millier" in scalar:
        return 1_000.0

    raw_id = str(row.get("SCALAR_ID") or "").strip()
    try:
        scalar_id = int(raw_id)
    except ValueError:
        scalar_id = 0
    if scalar_id in {0, 3, 6, 9}:
        return float(10**scalar_id)
    return 1.0


def _parse_retail_sales_zip(
    content: bytes,
) -> dict[str, list[tuple[str, float]]]:
    # Official selection:
    # Retail trade [44-45] / Total retail sales / Seasonally adjusted.
    by_geo: dict[str, list[tuple[str, float]]] = {}

    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        csv_name = next(
            (
                name
                for name in archive.namelist()
                if name.endswith(RETAIL_SALES_CSV_NAME)
            ),
            None,
        )
        if csv_name is None:
            raise ValueError("20100056.csv absent de l'archive StatCan")

        with archive.open(csv_name) as raw:
            text = io.TextIOWrapper(
                raw,
                encoding="utf-8-sig",
                newline="",
            )
            reader = csv.DictReader(text)
            naics_key = (
                "North American Industry Classification System (NAICS)"
            )

            for row in reader:
                if row.get(naics_key) != "Retail trade [44-45]":
                    continue
                if row.get("Sales") != "Total retail sales":
                    continue
                if row.get("Adjustments") != "Seasonally adjusted":
                    continue

                geo = str(row.get("GEO") or "").strip()
                ref = str(row.get("REF_DATE") or "").strip()
                raw_value = row.get("VALUE")
                if not geo or not ref or raw_value in (None, ""):
                    continue

                try:
                    value = float(str(raw_value))
                except ValueError:
                    continue

                value *= _retail_scalar_multiplier(row)
                by_geo.setdefault(geo, []).append((ref, value))

    for geo, rows in list(by_geo.items()):
        rows.sort(key=lambda item: item[0])
        by_geo[geo] = rows[-61:]

    return by_geo



class ProvincialStatisticsService:
    metric_concurrency = 2

    def __init__(self) -> None:
        self._metadata_cache: dict[int, _CachedMetadata] = {}
        self._cache: dict[tuple[str, str], tuple[float, ProvincialStatisticsSnapshot]] = {}
        self._last_good: dict[tuple[str, str], ProvincialStatisticsSnapshot] = {}
        self._retail_sales_cache: tuple[
            float,
            dict[str, list[tuple[str, float]]],
        ] | None = None
        self._lock = asyncio.Lock()

    async def _post(
        self,
        client: httpx.AsyncClient,
        method: str,
        body: list[dict[str, Any]],
    ) -> Any:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = await client.post(
                    f"{WDS_BASE}/{method}",
                    json=body,
                )
                response.raise_for_status()
                return response.json()
            except (
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadError,
                httpx.ReadTimeout,
                httpx.RemoteProtocolError,
            ) as exc:
                last_error = exc
                if attempt == 0:
                    await asyncio.sleep(0.25)
                    continue
                raise
        assert last_error is not None
        raise last_error

    async def _metadata(
        self,
        client: httpx.AsyncClient,
        product_id: int,
    ) -> dict[str, Any]:
        now = monotonic()
        cached = self._metadata_cache.get(product_id)
        if cached and now - cached.stored_at < METADATA_CACHE_SECONDS:
            return cached.value

        payload = await self._post(
            client,
            "getCubeMetadata",
            [{"productId": product_id}],
        )
        first: Any = payload[0] if isinstance(payload, list) and payload else payload
        value = _unwrap(first)
        if not isinstance(value, dict):
            raise ValueError(f"Métadonnées WDS invalides pour {product_id}")
        self._metadata_cache[product_id] = _CachedMetadata(value=value, stored_at=now)
        return value



    async def _inflation_for_provinces(
        self,
        client: httpx.AsyncClient,
        spec: MetricSpec,
        provinces: list[dict[str, str]],
        lang: str,
    ) -> tuple[dict[str, ProvincialMetric], str | None]:
        requests: list[dict[str, int]] = []
        vector_to_code: dict[int, str] = {}

        for province in provinces:
            code = province["code"]
            vector_id = CPI_ALL_ITEMS_VECTOR_BY_CODE.get(code)
            if vector_id is None:
                continue
            requests.append(
                {
                    "vectorId": vector_id,
                    "latestN": 25,
                }
            )
            vector_to_code[vector_id] = code

        if not requests:
            return (
                {},
                f"{spec.table_id}: aucun vecteur IPC provincial configuré",
            )

        try:
            payload = await self._post(
                client,
                "getDataFromVectorsAndLatestNPeriods",
                requests,
            )
        except Exception as exc:  # noqa: BLE001
            return (
                {},
                f"{spec.table_id}: IPC indisponible "
                f"({type(exc).__name__})",
            )

        responses = payload if isinstance(payload, list) else [payload]
        table_url = (
            f"https://www150.statcan.gc.ca/t1/tbl1/"
            f"{'fr' if lang == 'fr' else 'en'}/"
            f"tv.action?pid={spec.simple_view_pid}"
        )
        by_code: dict[str, ProvincialMetric] = {}

        for response in responses:
            vector_id = _response_vector_id(response)
            if vector_id is None:
                continue
            code = vector_to_code.get(vector_id)
            if code is None:
                continue

            points = _sort_points(_point_list(response))
            if len(points) < 13:
                continue

            current, previous = _inflation_yoy_pair(points)
            if current is None:
                continue

            current_point = points[-1]
            previous_point = points[-2] if len(points) >= 2 else {}

            released_at = None
            release_value = current_point.get("releaseTime")
            if release_value:
                try:
                    released_at = datetime.fromisoformat(
                        str(release_value).replace("Z", "+00:00")
                    )
                except ValueError:
                    released_at = None

            by_code[code] = ProvincialMetric(
                key=spec.key,
                label=spec.label_en if lang == "en" else spec.label_fr,
                category=(
                    spec.category_en
                    if lang == "en"
                    else spec.category_fr
                ),
                value=current,
                previous_value=previous,
                change=(
                    current - previous
                    if previous is not None
                    else None
                ),
                change_kind="points",
                unit_kind="percent",
                reference_period=str(
                    current_point.get("refPerRaw")
                    or current_point.get("refPer")
                    or ""
                )
                or None,
                previous_reference_period=str(
                    previous_point.get("refPerRaw")
                    or previous_point.get("refPer")
                    or ""
                )
                or None,
                released_at=released_at,
                table_id=spec.table_id,
                table_url=table_url,
                status="available",
                note="derived_from_official_cpi_index",
                history=_inflation_yoy_history(
                    points,
                    limit=12,
                ),
            )

        if not by_code:
            return (
                {},
                f"{spec.table_id}: aucune inflation provinciale exploitable",
            )

        if len(by_code) < len(requests):
            return (
                by_code,
                f"{spec.table_id}: {len(by_code)}/{len(requests)} "
                "vecteurs IPC provinciaux disponibles",
            )

        return by_code, None

    async def _retail_sales_rows(
        self,
        client: httpx.AsyncClient,
    ) -> dict[str, list[tuple[str, float]]]:
        now = monotonic()
        cached = self._retail_sales_cache
        if (
            cached is not None
            and now - cached[0] < RETAIL_SALES_CACHE_SECONDS
        ):
            return cached[1]

        response = await client.get(
            RETAIL_SALES_CSV_URL,
            timeout=httpx.Timeout(
                connect=5.0,
                read=20.0,
                write=5.0,
                pool=5.0,
            ),
        )
        response.raise_for_status()

        rows = await asyncio.to_thread(
            _parse_retail_sales_zip,
            response.content,
        )
        self._retail_sales_cache = (now, rows)
        return rows

    async def _retail_sales_for_provinces(
        self,
        client: httpx.AsyncClient,
        spec: MetricSpec,
        provinces: list[dict[str, str]],
        lang: str,
    ) -> tuple[dict[str, ProvincialMetric], str | None]:
        try:
            rows_by_geo = await self._retail_sales_rows(client)
        except Exception as exc:  # noqa: BLE001
            return (
                {},
                f"{spec.table_id}: données retail indisponibles "
                f"({type(exc).__name__})",
            )

        by_code: dict[str, ProvincialMetric] = {}
        table_url = (
            f"https://www150.statcan.gc.ca/t1/tbl1/"
            f"{'fr' if lang == 'fr' else 'en'}/"
            f"tv.action?pid={spec.simple_view_pid}"
        )

        for province in provinces:
            geo = str(province.get("en") or "").strip()
            rows = rows_by_geo.get(geo, [])
            if not rows:
                continue

            current_ref, current = rows[-1]
            previous_ref = None
            previous = None
            if len(rows) >= 2:
                previous_ref, previous = rows[-2]

            by_code[province["code"]] = ProvincialMetric(
                key=spec.key,
                label=spec.label_en if lang == "en" else spec.label_fr,
                category=(
                    spec.category_en
                    if lang == "en"
                    else spec.category_fr
                ),
                value=current,
                previous_value=previous,
                change=_change(
                    current,
                    previous,
                    spec.change_kind,
                ),
                change_kind=spec.change_kind,
                unit_kind=spec.unit_kind,
                reference_period=current_ref,
                previous_reference_period=previous_ref,
                released_at=None,
                table_id=spec.table_id,
                table_url=table_url,
                status="available",
                note=(
                    "Official Statistics Canada CSV table "
                    "20-10-0056-01"
                ),
                history=[
                    ProvincialMetricPoint(
                        period=period,
                        value=value,
                    )
                    for period, value in rows[-12:]
                ],
            )

        if not by_code:
            return (
                {},
                f"{spec.table_id}: aucune vente au détail exploitable",
            )

        if len(by_code) < len(provinces):
            return (
                by_code,
                f"{spec.table_id}: {len(by_code)}/{len(provinces)} "
                "géographies retail disponibles",
            )

        return by_code, None

    async def _metric_for_provinces(
        self,
        client: httpx.AsyncClient,
        spec: MetricSpec,
        provinces: list[dict[str, str]],
        lang: str,
    ) -> tuple[dict[str, ProvincialMetric], str | None]:
        if spec.key == "inflation_yoy":
            return await self._inflation_for_provinces(
                client,
                spec,
                provinces,
                lang,
            )

        if spec.key == "retail_sales":
            return await self._retail_sales_for_provinces(
                client,
                spec,
                provinces,
                lang,
            )

        try:
            metadata = await self._metadata(client, spec.product_id)
        except Exception as exc:
            return {}, f"{spec.table_id}: métadonnées indisponibles ({type(exc).__name__})"

        requests: list[dict[str, Any]] = []
        coordinate_to_code: dict[str, str] = {}
        for province in provinces:
            coordinate = _resolve_coordinate(metadata, spec, province)
            if not coordinate:
                continue
            requests.append(
                {
                    "productId": spec.product_id,
                    "coordinate": coordinate,
                    "latestN": spec.latest_n,
                }
            )
            coordinate_to_code[coordinate] = province["code"]

        if not requests:
            return {}, f"{spec.table_id}: aucune série provinciale résolue sans ambiguïté"

        try:
            payload = await self._post(
                client,
                "getDataFromCubePidCoordAndLatestNPeriods",
                requests,
            )
        except Exception as exc:
            return {}, f"{spec.table_id}: données indisponibles ({type(exc).__name__})"

        responses = payload if isinstance(payload, list) else [payload]
        responses_by_code = _responses_by_code(responses, coordinate_to_code)
        by_code: dict[str, ProvincialMetric] = {}
        table_url = (
            f"https://www150.statcan.gc.ca/t1/tbl1/"
            f"{'fr' if lang == 'fr' else 'en'}/tv.action?pid={spec.simple_view_pid}"
        )

        for code, response in responses_by_code.items():
            points = _sort_points(_point_list(response))
            if not points:
                continue
            current_point = points[-1]
            previous_point = points[-2] if len(points) >= 2 else {}

            if spec.key == "inflation_yoy":
                current, previous = _inflation_yoy_pair(points)
            else:
                current = _scaled_value(current_point)
                previous = (
                    _scaled_value(previous_point)
                    if previous_point
                    else None
                )

            if current is None:
                continue

            released_at = None
            release_value = current_point.get("releaseTime")
            if release_value:
                try:
                    released_at = datetime.fromisoformat(str(release_value).replace("Z", "+00:00"))
                except ValueError:
                    released_at = None

            by_code[code] = ProvincialMetric(
                key=spec.key,
                label=spec.label_en if lang == "en" else spec.label_fr,
                category=spec.category_en if lang == "en" else spec.category_fr,
                value=current,
                previous_value=previous,
                change=_change(current, previous, spec.change_kind),
                change_kind=spec.change_kind,
                unit_kind=spec.unit_kind,
                reference_period=str(
                    current_point.get("refPerRaw")
                    or current_point.get("refPer")
                    or ""
                )
                or None,
                previous_reference_period=str(
                    previous_point.get("refPerRaw")
                    or previous_point.get("refPer")
                    or ""
                )
                or None,
                released_at=released_at,
                table_id=spec.table_id,
                table_url=table_url,
                status="available",
                history=_history_from_points(
                    points,
                    limit=12,
                ),
            )

        if not by_code:
            return {}, f"{spec.table_id}: aucune donnée provinciale exploitable"

        if len(by_code) < len(requests):
            return (
                by_code,
                f"{spec.table_id}: {len(by_code)}/{len(requests)} séries "
                "appariées par coordonnée",
            )
        return by_code, None

    async def _build(
        self,
        region: str,
        lang: str,
    ) -> ProvincialStatisticsSnapshot:
        selected = (
            list(PROVINCES)
            if region == "ALL"
            else [PROVINCE_BY_CODE[region]]
        )
        timeout = httpx.Timeout(connect=4.0, read=10.0, write=4.0, pool=4.0)
        headers = {
            "Accept": "application/json",
            "User-Agent": "Anatole/1.4 provincial-statistics",
        }

        results_by_code: dict[str, list[ProvincialMetric]] = {
            province["code"]: [] for province in selected
        }
        issues: list[str] = []

        async with httpx.AsyncClient(
            timeout=timeout,
            headers=headers,
            follow_redirects=True,
        ) as client:
            semaphore = asyncio.Semaphore(self.metric_concurrency)

            async def load_metric(spec: MetricSpec):
                async with semaphore:
                    return await self._metric_for_provinces(
                        client,
                        spec,
                        selected,
                        lang,
                    )

            results = await asyncio.gather(
                *(load_metric(spec) for spec in METRICS)
            )

        for metrics, issue in results:
            if issue:
                issues.append(issue)
            for code, metric in metrics.items():
                results_by_code.setdefault(code, []).append(metric)

        profiles: list[ProvincialProfile] = []
        for province in selected:
            code = province["code"]
            metrics = results_by_code.get(code, [])
            profiles.append(
                ProvincialProfile(
                    code=code,
                    name=province[lang],
                    metrics=metrics,
                    official_source_name=province[
                        "source_name_en" if lang == "en" else "source_name_fr"
                    ],
                    official_source_url=province["source_url"],
                )
            )

        available = sum(len(profile.metrics) for profile in profiles)
        expected = len(selected) * len(METRICS)
        if available == expected:
            source_state = "ok"
        elif available > 0:
            source_state = "partial"
        else:
            source_state = "unavailable"

        status_detail = (
            f"{available}/{expected} séries provinciales résolues"
            if lang == "fr"
            else f"{available}/{expected} provincial series resolved"
        )
        if issues:
            status_detail += " · " + " | ".join(issues[:4])

        return ProvincialStatisticsSnapshot(
            requested_region=region,
            language=lang,
            provinces=profiles,
            source_statuses=[
                ProvincialStatisticsSourceStatus(
                    source="Statistique Canada — WDS",
                    status=source_state,
                    detail=status_detail,
                )
            ],
            generated_at=datetime.now(UTC),
            refresh_after_seconds=(
                1800
                if available == expected
                else 15
                if available > 0
                else 30
            ),
        )

    def peek_snapshot(
        self,
        region: str | None = None,
        lang: str | None = "fr",
    ) -> tuple[ProvincialStatisticsSnapshot | None, bool]:
        """Retourne immédiatement le cache/last-good sans déclencher de réseau.

        Le booléen indique que le portrait doit être considéré stale et rafraîchi
        en arrière-plan.
        """
        normalized_region = normalize_region(region)
        normalized_lang = _language(lang)
        cache_key = (normalized_region, normalized_lang)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return (
                cached[1],
                monotonic() - cached[0]
                >= cached[1].refresh_after_seconds,
            )
        previous = self._last_good.get(cache_key)
        return previous, previous is not None

    async def get_snapshot(
        self,
        region: str | None = None,
        lang: str | None = "fr",
        *,
        force: bool = False,
    ) -> ProvincialStatisticsSnapshot:
        normalized_region = normalize_region(region)
        normalized_lang = _language(lang)
        cache_key = (normalized_region, normalized_lang)
        now = monotonic()

        cached = self._cache.get(cache_key)
        if (
            not force
            and cached
            and now - cached[0] < cached[1].refresh_after_seconds
        ):
            return cached[1]

        async with self._lock:
            now = monotonic()
            cached = self._cache.get(cache_key)
            if (
                not force
                and cached
                and now - cached[0] < cached[1].refresh_after_seconds
            ):
                return cached[1]

            try:
                snapshot = await self._build(normalized_region, normalized_lang)
            except Exception:
                previous = self._last_good.get(cache_key)
                if previous is not None:
                    return previous
                raise

            previous = self._last_good.get(cache_key)
            fallback_used = False

            if previous is not None:
                previous_by_code = {
                    profile.code: profile
                    for profile in previous.provinces
                }
                merged_profiles = []
                for profile in snapshot.provinces:
                    prior = previous_by_code.get(profile.code)
                    current_keys = {
                        metric.key for metric in profile.metrics
                    }
                    fallback_metrics = []
                    if prior is not None:
                        fallback_metrics = [
                            metric.model_copy(
                                update={"note": "last_good"}
                            )
                            for metric in prior.metrics
                            if metric.key not in current_keys
                        ]
                    if fallback_metrics:
                        fallback_used = True
                    merged_profiles.append(
                        profile.model_copy(
                            update={
                                "metrics": [
                                    *profile.metrics,
                                    *fallback_metrics,
                                ]
                            }
                        )
                    )

                if fallback_used:
                    available = sum(
                        len(profile.metrics)
                        for profile in merged_profiles
                    )
                    expected = len(merged_profiles) * len(METRICS)
                    detail = (
                        f"{available}/{expected} séries provinciales résolues"
                        if normalized_lang == "fr"
                        else f"{available}/{expected} provincial series resolved"
                    )
                    detail += (
                        " · certaines séries reprises du dernier portrait disponible"
                        if normalized_lang == "fr"
                        else " · some series carried forward from the latest available snapshot"
                    )
                    snapshot = snapshot.model_copy(
                        update={
                            "provinces": merged_profiles,
                            "source_statuses": [
                                ProvincialStatisticsSourceStatus(
                                    source="Statistique Canada — WDS",
                                    status="partial",
                                    detail=detail,
                                )
                            ],
                            "refresh_after_seconds": 15,
                        }
                    )

            if any(profile.metrics for profile in snapshot.provinces):
                self._last_good[cache_key] = snapshot
            elif previous is not None:
                return previous

            self._cache[cache_key] = (monotonic(), snapshot)
            return snapshot


provincial_statistics_service = ProvincialStatisticsService()
