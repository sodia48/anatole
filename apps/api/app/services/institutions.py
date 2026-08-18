from __future__ import annotations

import asyncio
import json
import math
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from time import monotonic
from typing import Any, Awaitable, Callable, Generic, TypeVar
from xml.etree import ElementTree

import httpx

from app.core.config import settings
from app.core.resilience import shared_http_client
from app.schemas.institutions import (
    InstitutionDetail,
    InstitutionFlow,
    InstitutionHolding,
    InstitutionSourceStatus,
    InstitutionSummary,
    InstitutionsSnapshot,
)


SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data"
SEC_13F_DATASETS_URL = (
    "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets"
)
FINNHUB_SEARCH_URL = "https://finnhub.io/api/v1/search"
UNIVERSE_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "institution_universe.json"
)

SUBMISSIONS_TTL_SECONDS = 6 * 60 * 60
FILING_TTL_SECONDS = 24 * 60 * 60
DETAIL_TTL_SECONDS = 6 * 60 * 60
SNAPSHOT_TTL_SECONDS = 6 * 60 * 60
TICKER_TTL_SECONDS = 30 * 24 * 60 * 60
STALE_TTL_SECONDS = 30 * 24 * 60 * 60
SEC_REQUEST_INTERVAL_SECONDS = 0.11
SEC_MAX_CONCURRENCY = 5
TICKER_RESOLVE_LIMIT = 25
LEGACY_VALUE_CHANGE_DATE = date(2023, 1, 3)

T = TypeVar("T")


class InstitutionsUnavailable(RuntimeError):
    pass


class MissingInformationTable(ValueError):
    pass


@dataclass(frozen=True)
class FilingMetadata:
    cik: str
    accession: str
    form: str
    filed_at: date
    report_period: date
    primary_document: str

    @property
    def accession_compact(self) -> str:
        return self.accession.replace("-", "")

    @property
    def directory_url(self) -> str:
        return (
            f"{SEC_ARCHIVES_URL}/{int(self.cik)}/"
            f"{self.accession_compact}"
        )

    @property
    def filing_url(self) -> str:
        return f"{self.directory_url}/{self.accession}-index.html"

    @property
    def primary_url(self) -> str:
        return f"{self.directory_url}/{self.primary_document}"

    @property
    def value_multiplier(self) -> float:
        return 1000.0 if self.filed_at < LEGACY_VALUE_CHANGE_DATE else 1.0


@dataclass
class CacheEntry(Generic[T]):
    value: T
    stored_at: float


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _text(node: ElementTree.Element, name: str) -> str:
    expected = name.lower()
    for child in node.iter():
        if _local_name(child.tag) == expected and child.text:
            return child.text.strip()
    return ""


def _number(value: Any) -> float:
    try:
        parsed = float(str(value or "0").replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0
    return parsed if math.isfinite(parsed) else 0.0


def _date(value: Any) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def parse_13f_information_table(
    xml_document: str,
    *,
    value_multiplier: float = 1.0,
) -> list[InstitutionHolding]:
    try:
        root = ElementTree.fromstring(xml_document)
    except ElementTree.ParseError as exc:
        raise ValueError("Invalid 13F information table XML") from exc

    tables = [
        node for node in root.iter()
        if _local_name(node.tag) == "informationtable"
    ]
    if _local_name(root.tag) == "informationtable":
        table = root
    elif tables:
        table = tables[0]
    else:
        raise MissingInformationTable("Missing 13F information table")

    output: list[InstitutionHolding] = []
    for row in table.iter():
        if _local_name(row.tag) != "infotable":
            continue
        cusip = _text(row, "cusip").upper()
        issuer = _text(row, "nameofissuer")
        if not cusip or not issuer:
            continue
        shares = max(0.0, _number(_text(row, "sshprnamt")))
        value = max(
            0.0,
            _number(_text(row, "value")) * value_multiplier,
        )
        put_call = _text(row, "putcall").upper() or None
        output.append(
            InstitutionHolding(
                cusip=cusip,
                ticker=None,
                issuer=issuer,
                security_class=_text(row, "titleofclass"),
                shares=shares,
                previous_shares=0,
                share_change=0,
                share_change_percent=None,
                value=value,
                portfolio_weight_percent=0,
                previous_value=0,
                put_call=put_call,
                status="unchanged",
            )
        )

    total_value = sum(item.value for item in output)
    if total_value:
        output = [
            item.model_copy(update={
                "portfolio_weight_percent": min(
                    100.0,
                    item.value / total_value * 100,
                )
            })
            for item in output
        ]
    return output


def _aggregate_holdings(
    holdings: list[InstitutionHolding],
) -> dict[tuple[str, str, str], InstitutionHolding]:
    output: dict[tuple[str, str, str], InstitutionHolding] = {}
    for holding in holdings:
        key = (
            holding.cusip,
            holding.security_class,
            holding.put_call or "",
        )
        previous = output.get(key)
        if previous is None:
            output[key] = holding
            continue
        output[key] = previous.model_copy(update={
            "shares": previous.shares + holding.shares,
            "value": previous.value + holding.value,
        })
    return output


def compare_holdings(
    current: list[InstitutionHolding],
    previous: list[InstitutionHolding],
) -> list[InstitutionHolding]:
    current_map = _aggregate_holdings(current)
    previous_map = _aggregate_holdings(previous)
    total_value = sum(item.value for item in current_map.values())
    output: list[InstitutionHolding] = []
    for key in set(current_map) | set(previous_map):
        current_item = current_map.get(key)
        previous_item = previous_map.get(key)
        reference = current_item or previous_item
        assert reference is not None
        shares = current_item.shares if current_item else 0.0
        previous_shares = previous_item.shares if previous_item else 0.0
        value = current_item.value if current_item else 0.0
        previous_value = previous_item.value if previous_item else 0.0
        change = shares - previous_shares
        if current_item is not None and previous_item is None:
            holding_status = "new"
        elif current_item is None and previous_item is not None:
            holding_status = "closed"
        elif change > 0:
            holding_status = "increased"
        elif change < 0:
            holding_status = "reduced"
        else:
            holding_status = "unchanged"
        change_percent = (
            change / previous_shares * 100
            if previous_shares else None
        )
        output.append(
            reference.model_copy(update={
                "shares": shares,
                "previous_shares": previous_shares,
                "share_change": change,
                "share_change_percent": change_percent,
                "value": value,
                "previous_value": previous_value,
                "portfolio_weight_percent": (
                    value / total_value * 100 if total_value else 0
                ),
                "status": holding_status,
                "ticker": (
                    current_item.ticker if current_item else previous_item.ticker
                ),
            })
        )
    return sorted(
        output,
        key=lambda item: max(item.value, item.previous_value),
        reverse=True,
    )


def _country_from_submissions(payload: dict[str, Any]) -> str:
    addresses = payload.get("addresses")
    if not isinstance(addresses, dict):
        return "Non déterminé"
    business = addresses.get("business")
    if not isinstance(business, dict):
        return "Non déterminé"
    code = str(business.get("stateOrCountry") or "").upper()
    description = str(
        business.get("stateOrCountryDescription") or ""
    ).lower()
    if code in {
        "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9",
        "B0", "Z4",
    } or "canada" in description:
        return "Canada"
    if code in {
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
        "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
        "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
        "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
        "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI",
        "WY", "PR", "VI",
    } or "united states" in description:
        return "États-Unis"
    return str(
        business.get("stateOrCountryDescription") or "Non déterminé"
    ).strip() or "Non déterminé"


def _filings(payload: dict[str, Any]) -> list[FilingMetadata]:
    recent = payload.get("filings", {}).get("recent", {})
    if not isinstance(recent, dict):
        return []
    output: list[FilingMetadata] = []
    forms = recent.get("form") or []
    accessions = recent.get("accessionNumber") or []
    filed_dates = recent.get("filingDate") or []
    report_dates = recent.get("reportDate") or []
    documents = recent.get("primaryDocument") or []
    cik = str(payload.get("cik") or "").zfill(10)
    for form, accession, filed_at, report_period, document in zip(
        forms,
        accessions,
        filed_dates,
        report_dates,
        documents,
        strict=False,
    ):
        normalized_form = str(form).upper()
        filed = _date(filed_at)
        report = _date(report_period)
        if (
            normalized_form not in {"13F-HR", "13F-HR/A"}
            or filed is None
            or report is None
            or not accession
            or not document
        ):
            continue
        output.append(FilingMetadata(
            cik=cik,
            accession=str(accession),
            form=normalized_form,
            filed_at=filed,
            report_period=report,
            primary_document=str(document),
        ))
    return sorted(
        output,
        key=lambda filing: (
            filing.report_period,
            filing.filed_at,
            filing.accession,
        ),
        reverse=True,
    )


def find_latest_13f(payload: dict[str, Any]) -> FilingMetadata | None:
    filings = _filings(payload)
    return filings[0] if filings else None


def find_previous_13f(payload: dict[str, Any]) -> FilingMetadata | None:
    filings = _filings(payload)
    if not filings:
        return None
    current_period = filings[0].report_period
    return next(
        (filing for filing in filings if filing.report_period < current_period),
        None,
    )


def _summary_counts(
    holdings: list[InstitutionHolding],
) -> dict[str, int]:
    return {
        name: sum(item.status == name for item in holdings)
        for name in ("new", "increased", "reduced", "closed")
    }


class InstitutionService:
    def __init__(
        self,
        *,
        sec_transport: httpx.AsyncBaseTransport | None = None,
        finnhub_transport: httpx.AsyncBaseTransport | None = None,
        universe_path: Path = UNIVERSE_PATH,
    ) -> None:
        self._sec_transport = sec_transport
        self._finnhub_transport = finnhub_transport
        self._universe_path = universe_path
        self._sec_semaphore = asyncio.Semaphore(SEC_MAX_CONCURRENCY)
        self._finnhub_semaphore = asyncio.Semaphore(5)
        self._rate_lock = asyncio.Lock()
        self._last_sec_request_at: float | None = None
        self._locks: dict[str, asyncio.Lock] = {}
        self._submissions_cache: dict[str, CacheEntry[dict[str, Any]]] = {}
        self._filing_cache: dict[str, CacheEntry[list[InstitutionHolding]]] = {}
        self._detail_cache: dict[str, CacheEntry[InstitutionDetail]] = {}
        self._snapshot_cache: CacheEntry[InstitutionsSnapshot] | None = None
        self._ticker_cache: dict[str, CacheEntry[str | None]] = {}
        self._snapshot_refresh_task: asyncio.Task[InstitutionsSnapshot] | None = None

    @property
    def sec_headers(self) -> dict[str, str]:
        return {
            "User-Agent": settings.sec_user_agent,
            "Accept-Encoding": "gzip, deflate",
            "Accept": "application/json,application/xml,text/xml,*/*",
        }

    def _lock_for(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    async def _respect_fair_access(self) -> None:
        async with self._rate_lock:
            now = monotonic()
            if self._last_sec_request_at is not None:
                delay = (
                    SEC_REQUEST_INTERVAL_SECONDS
                    - (now - self._last_sec_request_at)
                )
                if delay > 0:
                    await asyncio.sleep(delay)
            self._last_sec_request_at = monotonic()

    async def _sec_request(self, url: str) -> httpx.Response:
        await self._respect_fair_access()
        async with self._sec_semaphore:
            if self._sec_transport is not None:
                async with httpx.AsyncClient(
                    transport=self._sec_transport,
                    timeout=15,
                    follow_redirects=True,
                ) as client:
                    response = await client.get(url, headers=self.sec_headers)
                    response.raise_for_status()
                    return response
            return await shared_http_client.request(
                "GET",
                url,
                headers=self.sec_headers,
                attempts=1,
            )

    async def _cached(
        self,
        cache: dict[str, CacheEntry[T]],
        key: str,
        *,
        ttl: float,
        loader: Callable[[], Awaitable[T]],
        force_refresh: bool,
    ) -> tuple[T, bool]:
        cached = cache.get(key)
        if (
            cached is not None
            and not force_refresh
            and monotonic() - cached.stored_at <= ttl
        ):
            return cached.value, False
        async with self._lock_for(key):
            cached = cache.get(key)
            if (
                cached is not None
                and not force_refresh
                and monotonic() - cached.stored_at <= ttl
            ):
                return cached.value, False
            try:
                value = await loader()
            except asyncio.CancelledError:
                raise
            except Exception:
                if (
                    cached is not None
                    and monotonic() - cached.stored_at <= STALE_TTL_SECONDS
                ):
                    return cached.value, True
                raise
            cache[key] = CacheEntry(value=value, stored_at=monotonic())
            return value, False

    async def get_submissions(
        self,
        cik: str,
        *,
        force_refresh: bool = False,
    ) -> tuple[dict[str, Any], bool]:
        normalized = str(cik).strip().zfill(10)

        async def load() -> dict[str, Any]:
            response = await self._sec_request(
                SEC_SUBMISSIONS_URL.format(cik=normalized)
            )
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("Invalid SEC submissions response")
            return payload

        return await self._cached(
            self._submissions_cache,
            f"submissions:{normalized}",
            ttl=SUBMISSIONS_TTL_SECONDS,
            loader=load,
            force_refresh=force_refresh,
        )

    async def fetch_13f_information_table(
        self,
        filing: FilingMetadata,
        *,
        force_refresh: bool = False,
    ) -> tuple[list[InstitutionHolding], bool]:
        async def load() -> list[InstitutionHolding]:
            index_response = await self._sec_request(
                f"{filing.directory_url}/index.json"
            )
            payload = index_response.json()
            items = payload.get("directory", {}).get("item", [])
            if not isinstance(items, list):
                raise MissingInformationTable("Missing EDGAR filing directory")
            candidates: list[str] = []
            primary_name = Path(filing.primary_document).name.lower()
            for item in items:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "")
                lowered = name.lower()
                if (
                    lowered.endswith(".xml")
                    and Path(name).name.lower() != primary_name
                ):
                    candidates.append(name)
            candidates.sort(key=lambda name: (
                not bool(re.search(r"info(?:rmation)?table|13f", name, re.I)),
                name,
            ))
            if not candidates:
                raise MissingInformationTable("Missing 13F information table")
            last_error: Exception | None = None
            for name in candidates[:4]:
                response = await self._sec_request(
                    f"{filing.directory_url}/{name}"
                )
                try:
                    return parse_13f_information_table(
                        response.text,
                        value_multiplier=filing.value_multiplier,
                    )
                except MissingInformationTable as exc:
                    last_error = exc
            raise last_error or MissingInformationTable(
                "Missing 13F information table"
            )

        return await self._cached(
            self._filing_cache,
            f"filing:{filing.accession}",
            ttl=FILING_TTL_SECONDS,
            loader=load,
            force_refresh=force_refresh,
        )

    async def resolve_ticker(self, cusip: str) -> str | None:
        normalized = cusip.strip().upper()
        cached = self._ticker_cache.get(normalized)
        if cached and monotonic() - cached.stored_at <= TICKER_TTL_SECONDS:
            return cached.value
        if not settings.finnhub_api_key:
            self._ticker_cache[normalized] = CacheEntry(None, monotonic())
            return None
        try:
            async with self._finnhub_semaphore:
                if self._finnhub_transport is not None:
                    async with httpx.AsyncClient(
                        transport=self._finnhub_transport,
                        timeout=12,
                        follow_redirects=True,
                    ) as client:
                        response = await client.get(
                            FINNHUB_SEARCH_URL,
                            params={"q": normalized},
                            headers={
                                "X-Finnhub-Token": settings.finnhub_api_key
                            },
                        )
                        response.raise_for_status()
                else:
                    response = await shared_http_client.request(
                        "GET",
                        FINNHUB_SEARCH_URL,
                        params={"q": normalized},
                        headers={
                            "X-Finnhub-Token": settings.finnhub_api_key
                        },
                        attempts=1,
                    )
            payload = response.json()
            rows = payload.get("result", []) if isinstance(payload, dict) else []
            symbols = {
                str(row.get("symbol") or "").strip().upper()
                for row in rows
                if isinstance(row, dict)
                and str(row.get("symbol") or "").strip()
                and str(row.get("description") or "").strip()
            }
            ticker = next(iter(symbols)) if len(symbols) == 1 else None
        except Exception:
            ticker = None
        self._ticker_cache[normalized] = CacheEntry(ticker, monotonic())
        return ticker

    async def _resolve_top_tickers(
        self,
        holdings: list[InstitutionHolding],
    ) -> list[InstitutionHolding]:
        if not settings.finnhub_api_key:
            return holdings
        semaphore = asyncio.Semaphore(5)

        async def resolve(index: int, holding: InstitutionHolding) -> None:
            async with semaphore:
                ticker = await self.resolve_ticker(holding.cusip)
            if ticker:
                holdings[index] = holding.model_copy(update={"ticker": ticker})

        await asyncio.gather(*[
            resolve(index, holding)
            for index, holding in enumerate(holdings[:TICKER_RESOLVE_LIMIT])
        ])
        return holdings

    def _seed_payload(self) -> dict[str, Any]:
        try:
            payload = json.loads(self._universe_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise InstitutionsUnavailable(
                "L’univers institutionnel officiel est indisponible."
            ) from exc
        if not isinstance(payload, dict):
            raise InstitutionsUnavailable(
                "L’univers institutionnel officiel est invalide."
            )
        return payload

    def _seed_snapshot(self, limit: int) -> InstitutionsSnapshot:
        payload = self._seed_payload()
        institutions = [
            InstitutionSummary.model_validate(item)
            for item in payload.get("institutions", [])
        ]
        institutions.sort(key=lambda item: item.total_13f_value, reverse=True)
        generated = datetime.fromisoformat(
            str(payload.get("generated_at") or datetime.now(UTC).isoformat())
        )
        return InstitutionsSnapshot(
            institutions=institutions[:limit],
            top_increased=[
                InstitutionFlow.model_validate(item)
                for item in payload.get("top_increased", [])
            ],
            top_new=[
                InstitutionFlow.model_validate(item)
                for item in payload.get("top_new", [])
            ],
            top_reduced=[
                InstitutionFlow.model_validate(item)
                for item in payload.get("top_reduced", [])
            ],
            top_closed=[
                InstitutionFlow.model_validate(item)
                for item in payload.get("top_closed", [])
            ],
            report_period=_date(payload.get("report_period")),
            previous_report_period=_date(payload.get("previous_report_period")),
            generated_at=generated,
            sources=[InstitutionSourceStatus(
                source="SEC EDGAR — Form 13F-HR",
                status="available",
                detail=(
                    "Classement calculé depuis les datasets structurés SEC; "
                    "les positions détaillées sont chargées à la demande."
                ),
                url=str(payload.get("source_url") or SEC_13F_DATASETS_URL),
                updated_at=generated,
            )],
        )

    async def _live_summary(
        self,
        cik: str,
        *,
        force_refresh: bool,
    ) -> tuple[InstitutionSummary, list[InstitutionHolding], bool]:
        submissions, submissions_stale = await self.get_submissions(
            cik,
            force_refresh=force_refresh,
        )
        latest = find_latest_13f(submissions)
        previous = find_previous_13f(submissions)
        if latest is None:
            raise MissingInformationTable(
                "Aucun dépôt 13F-HR officiel trouvé."
            )
        current_holdings, current_stale = (
            await self.fetch_13f_information_table(
                latest,
                force_refresh=force_refresh,
            )
        )
        previous_holdings: list[InstitutionHolding] = []
        previous_stale = False
        if previous is not None:
            previous_holdings, previous_stale = (
                await self.fetch_13f_information_table(
                    previous,
                    force_refresh=force_refresh,
                )
            )
            compared = compare_holdings(current_holdings, previous_holdings)
            comparison_available = True
        else:
            compared = current_holdings
            comparison_available = False
        total_value = sum(item.value for item in current_holdings)
        previous_value = sum(item.value for item in previous_holdings)
        top10_value = sum(sorted(
            (item.value for item in current_holdings),
            reverse=True,
        )[:10])
        counts = _summary_counts(compared) if comparison_available else {
            "new": 0,
            "increased": 0,
            "reduced": 0,
            "closed": 0,
        }
        return (
            InstitutionSummary(
                cik=str(cik).strip().zfill(10),
                name=str(submissions.get("name") or cik),
                country=_country_from_submissions(submissions),
                report_period=latest.report_period,
                filed_at=latest.filed_at,
                filing_url=latest.filing_url,
                total_13f_value=total_value,
                holdings_count=len(current_holdings),
                previous_total_13f_value=previous_value,
                top10_concentration_percent=(
                    top10_value / total_value * 100 if total_value else 0
                ),
                new_positions_count=counts["new"],
                increased_positions_count=counts["increased"],
                reduced_positions_count=counts["reduced"],
                closed_positions_count=counts["closed"],
                comparison_available=comparison_available,
            ),
            compared,
            submissions_stale or current_stale or previous_stale,
        )

    @staticmethod
    def _live_flows(
        details: list[tuple[InstitutionSummary, list[InstitutionHolding], bool]],
        status: str,
    ) -> list[InstitutionFlow]:
        aggregated: dict[str, dict[str, Any]] = {}
        for institution, holdings, _ in details:
            for holding in holdings:
                item = aggregated.setdefault(holding.cusip, {
                    "issuer": holding.issuer,
                    "holding": set(),
                    "increased": set(),
                    "reduced": set(),
                    "new": set(),
                    "closed": set(),
                    "share_change": 0.0,
                    "share_change_reliable": True,
                    "value": 0.0,
                    "names": [],
                })
                if holding.status != "closed":
                    item["holding"].add(institution.cik)
                    item["value"] += holding.value
                if holding.status in {"increased", "reduced", "new", "closed"}:
                    item[holding.status].add(institution.cik)
                if holding.put_call:
                    item["share_change_reliable"] = False
                else:
                    item["share_change"] += holding.share_change
                if institution.name not in item["names"]:
                    item["names"].append(institution.name)

        flows = [
            InstitutionFlow(
                ticker=None,
                cusip=cusip,
                issuer=str(item["issuer"]),
                institutions_holding=len(item["holding"]),
                institutions_increased=len(item["increased"]),
                institutions_reduced=len(item["reduced"]),
                institutions_new=len(item["new"]),
                institutions_closed=len(item["closed"]),
                aggregate_share_change=(
                    float(item["share_change"])
                    if item["share_change_reliable"]
                    else None
                ),
                current_reported_value=float(item["value"]),
                institution_names=item["names"][:10],
            )
            for cusip, item in aggregated.items()
        ]
        counter = {
            "increased": "institutions_increased",
            "new": "institutions_new",
            "reduced": "institutions_reduced",
            "closed": "institutions_closed",
        }[status]
        flows.sort(
            key=lambda flow: (
                getattr(flow, counter),
                flow.current_reported_value,
            ),
            reverse=True,
        )
        return flows[:20]

    async def _refresh_live_snapshot(
        self,
        seed: InstitutionsSnapshot,
        *,
        force_refresh: bool,
    ) -> InstitutionsSnapshot:
        async with self._lock_for("snapshot:live"):
            payload = self._seed_payload()
            candidates = [
                InstitutionSummary.model_validate(item)
                for item in payload.get("institutions", [])
            ][:100]
            results = await asyncio.gather(*[
                self._live_summary(
                    institution.cik,
                    force_refresh=force_refresh,
                )
                for institution in candidates
            ], return_exceptions=True)
            live = [
                result for result in results
                if isinstance(result, tuple)
                and len(result) == 3
                and isinstance(result[0], InstitutionSummary)
            ]
            minimum = max(5, math.ceil(len(candidates) * 0.6))
            if len(live) < minimum:
                raise InstitutionsUnavailable(
                    "La réactualisation SEC live est trop partielle; "
                    "le dernier classement fiable est conservé."
                )
            live_ciks = {item[0].cik for item in live}
            combined = [item[0] for item in live]
            combined.extend(
                item for item in candidates
                if item.cik not in live_ciks
            )
            combined.sort(
                key=lambda item: item.total_13f_value,
                reverse=True,
            )
            periods = [item[0].report_period for item in live]
            previous_periods = [
                item[0].report_period
                for item in candidates
                if item.report_period < max(periods)
            ]
            stale = any(item[2] for item in live)
            partial = len(live) < len(candidates)
            source_status = "stale" if stale else (
                "partial" if partial else "available"
            )
            refreshed = InstitutionsSnapshot(
                institutions=combined[:50],
                top_increased=self._live_flows(live, "increased"),
                top_new=self._live_flows(live, "new"),
                top_reduced=self._live_flows(live, "reduced"),
                top_closed=self._live_flows(live, "closed"),
                report_period=max(periods),
                previous_report_period=(
                    max(previous_periods) if previous_periods
                    else seed.previous_report_period
                ),
                generated_at=datetime.now(UTC),
                sources=[InstitutionSourceStatus(
                    source="SEC EDGAR — Form 13F-HR",
                    status=source_status,
                    detail=(
                        f"{len(live)}/{len(candidates)} gestionnaires "
                        "réactualisés depuis leurs dépôts EDGAR live; "
                        "les derniers résumés officiels sont conservés "
                        "pour les autres."
                    ),
                    url=SEC_13F_DATASETS_URL,
                    updated_at=datetime.now(UTC),
                )],
                stale=stale,
                message=(
                    "Certaines réponses SEC proviennent du dernier cache fiable."
                    if stale else None
                ),
            )
            self._snapshot_cache = CacheEntry(refreshed, monotonic())
            return refreshed

    def _start_background_refresh(
        self,
        seed: InstitutionsSnapshot,
    ) -> None:
        if self._snapshot_refresh_task is not None:
            return
        task = asyncio.create_task(self._refresh_live_snapshot(
            seed,
            force_refresh=False,
        ))
        self._snapshot_refresh_task = task

        def finished(completed: asyncio.Task[InstitutionsSnapshot]) -> None:
            self._snapshot_refresh_task = None
            try:
                completed.result()
            except (asyncio.CancelledError, Exception):
                # Le snapshot officiel de départ reste le dernier bon état.
                pass

        task.add_done_callback(finished)

    async def institutions_snapshot(
        self,
        *,
        limit: int = 50,
        force_refresh: bool = False,
    ) -> InstitutionsSnapshot:
        bounded_limit = max(1, min(limit, 50))
        if (
            self._snapshot_cache is not None
            and not force_refresh
            and monotonic() - self._snapshot_cache.stored_at
            <= SNAPSHOT_TTL_SECONDS
        ):
            return self._snapshot_cache.value.model_copy(update={
                "institutions": self._snapshot_cache.value.institutions[
                    :bounded_limit
                ]
            })
        try:
            snapshot = self._seed_snapshot(50)
        except Exception:
            if self._snapshot_cache is not None:
                stale = self._snapshot_cache.value.model_copy(update={
                    "stale": True,
                    "message": (
                        "Les données institutionnelles sont temporairement "
                        "indisponibles. Le dernier instantané fiable est affiché."
                    ),
                    "sources": [
                        source.model_copy(update={"status": "stale"})
                        for source in self._snapshot_cache.value.sources
                    ],
                })
                return stale
            raise
        self._snapshot_cache = CacheEntry(snapshot, monotonic())
        if force_refresh:
            try:
                if self._snapshot_refresh_task is not None:
                    snapshot = await self._snapshot_refresh_task
                else:
                    snapshot = await self._refresh_live_snapshot(
                        snapshot,
                        force_refresh=True,
                    )
            except Exception:
                snapshot = snapshot.model_copy(update={
                    "stale": True,
                    "message": (
                        "La réactualisation SEC live est indisponible; "
                        "le dernier classement officiel est affiché."
                    ),
                    "sources": [
                        source.model_copy(update={"status": "stale"})
                        for source in snapshot.sources
                    ],
                })
                self._snapshot_cache = CacheEntry(snapshot, monotonic())
        elif (
            self._sec_transport is None
            and self._universe_path == UNIVERSE_PATH
            and settings.market_data_provider.lower() != "demo"
        ):
            self._start_background_refresh(snapshot)
        return snapshot.model_copy(update={
            "institutions": snapshot.institutions[:bounded_limit]
        })

    async def institution_detail(
        self,
        cik: str,
        *,
        force_refresh: bool = False,
    ) -> InstitutionDetail:
        normalized = str(cik).strip().zfill(10)
        if not re.fullmatch(r"\d{10}", normalized):
            raise ValueError("CIK invalide")
        cached = self._detail_cache.get(normalized)
        if (
            cached is not None
            and not force_refresh
            and monotonic() - cached.stored_at <= DETAIL_TTL_SECONDS
        ):
            return cached.value
        async with self._lock_for(f"detail:{normalized}"):
            cached = self._detail_cache.get(normalized)
            try:
                submissions, submissions_stale = await self.get_submissions(
                    normalized,
                    force_refresh=force_refresh,
                )
                latest = find_latest_13f(submissions)
                previous = find_previous_13f(submissions)
                if latest is None:
                    raise MissingInformationTable(
                        "Aucun dépôt 13F-HR officiel trouvé."
                    )
                current_holdings, current_stale = (
                    await self.fetch_13f_information_table(
                        latest,
                        force_refresh=force_refresh,
                    )
                )
                previous_holdings: list[InstitutionHolding] = []
                previous_stale = False
                if previous is not None:
                    previous_holdings, previous_stale = (
                        await self.fetch_13f_information_table(
                            previous,
                            force_refresh=force_refresh,
                        )
                    )
                    holdings = compare_holdings(
                        current_holdings,
                        previous_holdings,
                    )
                    comparison_available = True
                else:
                    holdings = current_holdings
                    comparison_available = False
                holdings = await self._resolve_top_tickers(holdings)
                total_value = sum(item.value for item in current_holdings)
                previous_value = sum(item.value for item in previous_holdings)
                top10_value = sum(
                    sorted((item.value for item in current_holdings), reverse=True)[:10]
                )
                counts = _summary_counts(holdings) if comparison_available else {
                    "new": 0,
                    "increased": 0,
                    "reduced": 0,
                    "closed": 0,
                }
                stale = submissions_stale or current_stale or previous_stale
                source_status = "stale" if stale else (
                    "partial" if latest.form.endswith("/A") else "available"
                )
                summary = InstitutionSummary(
                    cik=normalized,
                    name=str(submissions.get("name") or normalized),
                    country=_country_from_submissions(submissions),
                    report_period=latest.report_period,
                    filed_at=latest.filed_at,
                    filing_url=latest.filing_url,
                    total_13f_value=total_value,
                    holdings_count=len(current_holdings),
                    previous_total_13f_value=previous_value,
                    top10_concentration_percent=(
                        top10_value / total_value * 100 if total_value else 0
                    ),
                    new_positions_count=counts["new"],
                    increased_positions_count=counts["increased"],
                    reduced_positions_count=counts["reduced"],
                    closed_positions_count=counts["closed"],
                    comparison_available=comparison_available,
                )
                detail = InstitutionDetail(
                    institution=summary,
                    holdings=holdings,
                    previous_report_period=(
                        previous.report_period if previous else None
                    ),
                    source_statuses=[InstitutionSourceStatus(
                        source="SEC EDGAR — Form 13F-HR",
                        status=source_status,
                        detail=(
                            "Dépôt amendé; la table publiée par la SEC est "
                            "présentée comme telle."
                            if latest.form.endswith("/A")
                            else "Dépôt et table d’information officiels SEC."
                        ),
                        url=latest.filing_url,
                        updated_at=datetime.now(UTC),
                    )],
                    generated_at=datetime.now(UTC),
                    stale=stale,
                    message=(
                        "Dernière mise à jour fiable conservée."
                        if stale else None
                    ),
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if cached is not None:
                    return cached.value.model_copy(update={
                        "stale": True,
                        "message": (
                            "Les données institutionnelles sont temporairement "
                            "indisponibles. Le dernier instantané fiable est affiché."
                        ),
                        "source_statuses": [
                            source.model_copy(update={"status": "stale"})
                            for source in cached.value.source_statuses
                        ],
                    })
                raise InstitutionsUnavailable(str(exc)) from exc
            self._detail_cache[normalized] = CacheEntry(detail, monotonic())
            return detail

    async def ticker_institution_activity(
        self,
        query: str,
    ) -> InstitutionFlow:
        needle = query.strip().upper()
        if not needle:
            raise ValueError("Titre ou CUSIP requis")
        snapshot = await self.institutions_snapshot(limit=50)
        tasks = [
            self.institution_detail(institution.cik)
            for institution in snapshot.institutions
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        successful = [
            result for result in results
            if isinstance(result, InstitutionDetail)
        ]
        if not successful:
            raise InstitutionsUnavailable(
                "Les données institutionnelles sont temporairement indisponibles."
            )
        matches: list[tuple[InstitutionDetail, InstitutionHolding]] = []
        for detail in successful:
            for holding in detail.holdings:
                if holding.cusip == needle or holding.ticker == needle:
                    matches.append((detail, holding))
        matches.sort(key=lambda item: item[1].value, reverse=True)
        if not matches:
            return InstitutionFlow(
                ticker=None,
                cusip=needle if re.fullmatch(r"[A-Z0-9]{9}", needle) else "",
                issuer="",
                institutions_holding=0,
                institutions_increased=0,
                institutions_reduced=0,
                institutions_new=0,
                institutions_closed=0,
                aggregate_share_change=0,
                current_reported_value=0,
                institution_names=[],
            )
        holdings = [holding for _, holding in matches]
        reference = holdings[0]
        holding_ciks = {
            detail.institution.cik
            for detail, holding in matches
            if holding.status != "closed"
        }
        increased_ciks = {
            detail.institution.cik
            for detail, holding in matches
            if holding.status == "increased"
        }
        reduced_ciks = {
            detail.institution.cik
            for detail, holding in matches
            if holding.status == "reduced"
        }
        new_ciks = {
            detail.institution.cik
            for detail, holding in matches
            if holding.status == "new"
        }
        closed_ciks = {
            detail.institution.cik
            for detail, holding in matches
            if holding.status == "closed"
        }
        return InstitutionFlow(
            ticker=reference.ticker,
            cusip=reference.cusip,
            issuer=reference.issuer,
            institutions_holding=len(holding_ciks),
            institutions_increased=len(increased_ciks),
            institutions_reduced=len(reduced_ciks),
            institutions_new=len(new_ciks),
            institutions_closed=len(closed_ciks),
            aggregate_share_change=(
                None
                if any(item.put_call for item in holdings)
                else sum(item.share_change for item in holdings)
            ),
            current_reported_value=sum(item.value for item in holdings),
            institution_names=list(dict.fromkeys(
                detail.institution.name for detail, _ in matches
            ))[:10],
        )


institution_service = InstitutionService()
