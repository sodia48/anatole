from __future__ import annotations

import asyncio
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Iterable

import httpx

from app.schemas.provincial_statistics import (
    ProvincialMetric,
    ProvincialProfile,
    ProvincialStatisticsSnapshot,
    ProvincialStatisticsSourceStatus,
)


WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"
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
        latest_n=2,
        selectors=(
            _selector(
                ("product", "produit"),
                ("all items", "ensemble"),
            ),
            _selector(
                ("statistics", "statistique"),
                (
                    "12 month percentage change",
                    "12-month percentage change",
                    "percentage change from same month previous year",
                    "variation en pourcentage sur 12 mois",
                    "variation en pourcentage d une annee a l autre",
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
        table_id="14-10-0287-01",
        simple_view_pid="1410028701",
        unit_kind="percent",
        change_kind="points",
        latest_n=2,
        selectors=(
            _selector(
                ("labour force characteristics", "caracteristiques de la population active"),
                ("unemployment rate", "taux de chomage"),
            ),
            _selector(("sex", "sexe"), ("both sexes", "les deux sexes")),
            _selector(
                ("age", "groupe d age"),
                ("15 years and over", "15 ans et plus"),
            ),
            _selector(
                ("statistics", "statistique"),
                ("seasonally adjusted", "desaisonnalise"),
                required=False,
            ),
        ),
    ),
    MetricSpec(
        key="employment",
        label_fr="Emploi",
        label_en="Employment",
        category_fr="Travail",
        category_en="Labour",
        product_id=14100287,
        table_id="14-10-0287-01",
        simple_view_pid="1410028701",
        unit_kind="persons",
        change_kind="percent",
        latest_n=2,
        selectors=(
            _selector(
                ("labour force characteristics", "caracteristiques de la population active"),
                ("employment", "emploi"),
            ),
            _selector(("sex", "sexe"), ("both sexes", "les deux sexes")),
            _selector(
                ("age", "groupe d age"),
                ("15 years and over", "15 ans et plus"),
            ),
            _selector(
                ("statistics", "statistique"),
                ("seasonally adjusted", "desaisonnalise"),
                required=False,
            ),
        ),
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
        latest_n=2,
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
        latest_n=2,
        selectors=(
            _selector(
                ("estimates", "estimations"),
                ("gross domestic product at market prices", "produit interieur brut aux prix du marche"),
            ),
            _selector(
                ("prices", "prix"),
                ("chained 2017 dollars", "dollars enchaines de 2017"),
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
                ("industry", "industrie", "retail trade", "commerce de detail"),
                ("retail trade", "commerce de detail", "total retail"),
            ),
            _selector(
                ("adjustment", "ajustement", "statistics", "statistique"),
                ("seasonally adjusted", "desaisonnalise"),
                required=False,
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
        latest_n=2,
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


class ProvincialStatisticsService:
    def __init__(self) -> None:
        self._metadata_cache: dict[int, _CachedMetadata] = {}
        self._cache: dict[tuple[str, str], tuple[float, ProvincialStatisticsSnapshot]] = {}
        self._last_good: dict[tuple[str, str], ProvincialStatisticsSnapshot] = {}
        self._lock = asyncio.Lock()

    async def _post(
        self,
        client: httpx.AsyncClient,
        method: str,
        body: list[dict[str, Any]],
    ) -> Any:
        response = await client.post(
            f"{WDS_BASE}/{method}",
            json=body,
        )
        response.raise_for_status()
        return response.json()

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

    async def _metric_for_provinces(
        self,
        client: httpx.AsyncClient,
        spec: MetricSpec,
        provinces: list[dict[str, str]],
        lang: str,
    ) -> tuple[dict[str, ProvincialMetric], str | None]:
        try:
            metadata = await self._metadata(client, spec.product_id)
        except Exception as exc:
            return {}, f"{spec.table_id}: métadonnées indisponibles ({type(exc).__name__})"

        requests: list[dict[str, Any]] = []
        order: list[tuple[str, str]] = []
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
            order.append((province["code"], coordinate))

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
        by_code: dict[str, ProvincialMetric] = {}
        table_url = (
            f"https://www150.statcan.gc.ca/t1/tbl1/"
            f"{'fr' if lang == 'fr' else 'en'}/tv.action?pid={spec.simple_view_pid}"
        )

        for index, response in enumerate(responses):
            if index >= len(order):
                break
            code, _coordinate = order[index]
            points = _sort_points(_point_list(response))
            if not points:
                continue
            current_point = points[-1]
            previous_point = points[-2] if len(points) >= 2 else {}
            current = _scaled_value(current_point)
            previous = _scaled_value(previous_point) if previous_point else None
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
            )

        if not by_code:
            return {}, f"{spec.table_id}: aucune donnée provinciale exploitable"
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
        timeout = httpx.Timeout(connect=8.0, read=18.0, write=8.0, pool=8.0)
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
            tasks = [
                self._metric_for_provinces(client, spec, selected, lang)
                for spec in METRICS
            ]
            results = await asyncio.gather(*tasks)

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
            refresh_after_seconds=1800 if available else 180,
        )

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
        if not force and cached and now - cached[0] < CACHE_SECONDS:
            return cached[1]

        async with self._lock:
            now = monotonic()
            cached = self._cache.get(cache_key)
            if not force and cached and now - cached[0] < CACHE_SECONDS:
                return cached[1]

            try:
                snapshot = await self._build(normalized_region, normalized_lang)
            except Exception:
                previous = self._last_good.get(cache_key)
                if previous is not None:
                    return previous
                raise

            if any(profile.metrics for profile in snapshot.provinces):
                self._last_good[cache_key] = snapshot
            else:
                previous = self._last_good.get(cache_key)
                if previous is not None:
                    return previous

            self._cache[cache_key] = (monotonic(), snapshot)
            return snapshot


provincial_statistics_service = ProvincialStatisticsService()
