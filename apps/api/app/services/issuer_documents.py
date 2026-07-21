from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from time import monotonic
from typing import Iterable
from urllib.parse import (
    parse_qsl,
    urlencode,
    urljoin,
    urlparse,
    urlunparse,
)
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

import httpx

from app.schemas.fundamentals import (
    FinancialPeriod,
    IssuerDocumentCandidate,
    IssuerDocumentDiagnostics,
)
from app.services.issuer_document_parser import (
    financial_document_parser,
)


DATA_DIRECTORY = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "official_financials"
)
SITES_PATH = DATA_DIRECTORY / "issuer_sites.json"

FINANCIAL_KEYWORDS = (
    "financial statements",
    "financial statement",
    "interim financial",
    "annual financial",
    "quarterly report",
    "annual report",
    "shareholder report",
    "financial results",
    "quarterly results",
    "annual results",
    "supplementary information",
    "financial documents",
    "reports and filings",
    "regulatory reports",
    "etats financiers",
    "états financiers",
    "rapport trimestriel",
    "rapport annuel",
    "resultats financiers",
    "résultats financiers",
    "documents financiers",
    "rapports financiers",
)

PAGE_KEYWORDS = (
    "investor",
    "investors",
    "investor-relations",
    "financial",
    "results",
    "reports",
    "filings",
    "regulatory",
    "actionnaires",
    "investisseurs",
    "financiers",
    "resultats",
    "rapports",
)

NEGATIVE_KEYWORDS = (
    "presentation",
    "transcript",
    "webcast",
    "conference call",
    "proxy",
    "circular",
    "sustainability",
    "esg",
    "governance",
    "fact sheet",
    "factsheet",
    "audio",
)

COMMON_PATHS = (
    "/investors",
    "/investor-relations",
    "/investors/financial-reports",
    "/investors/financial-results",
    "/investors/reports-and-filings",
    "/investors/financial-documents",
    "/investors/results",
    "/en/investors/financial-documents",
    "/investisseurs",
    "/investisseurs/rapports-financiers",
    "/investisseurs/resultats-financiers",
)

YEAR_RE = re.compile(r"\b(20\d{2})\b")
QUARTER_RE = re.compile(
    r"\b(?:q([1-4])|t([1-4])|"
    r"first quarter|second quarter|third quarter|fourth quarter|"
    r"premier trimestre|deuxieme trimestre|troisieme trimestre|"
    r"quatrieme trimestre)\b",
    re.IGNORECASE,
)


@dataclass(slots=True)
class IssuerFinancialsResult:
    ticker: str
    website: str | None
    annual: list[FinancialPeriod]
    quarterly: list[FinancialPeriod]
    documents: list[IssuerDocumentCandidate]
    parsed_documents: int
    error: str | None = None


class _LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag.lower() != "a":
            return
        attributes = dict(attrs)
        self._href = attributes.get("href")
        self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            cleaned = " ".join(data.split())
            if cleaned:
                self._text.append(cleaned)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self._href is None:
            return
        self.links.append(
            (
                self._href,
                " ".join(self._text).strip(),
            )
        )
        self._href = None
        self._text = []


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    query = [
        (key, value)
        for key, value in parse_qsl(
            parsed.query,
            keep_blank_values=True,
        )
        if not key.lower().startswith("utm_")
    ]
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path,
            parsed.params,
            urlencode(query),
            "",
        )
    )


def document_format(url: str) -> str | None:
    lowered = url.lower()
    if ".xlsx" in lowered:
        return "xlsx"
    if ".xls" in lowered:
        return "xls"
    if ".pdf" in lowered:
        return "pdf"
    if lowered.endswith((".htm", ".html")):
        return "html"
    return None


def classify_document(
    title: str,
    url: str,
) -> str:
    value = f"{title} {url}".lower()

    if (
        "annual" in value
        or "year ended" in value
        or "rapport annuel" in value
    ):
        return "annual"

    if (
        QUARTER_RE.search(value)
        or "interim" in value
        or "quarterly" in value
        or "trimestriel" in value
    ):
        return "quarterly"

    if (
        "financial statement" in value
        or "etats financiers" in value
        or "états financiers" in value
    ):
        return "financial_statements"

    if (
        "supplementary" in value
        or "supplement" in value
    ):
        return "supplementary"

    return "unknown"


def score_document(
    title: str,
    url: str,
    *,
    current_year: int | None = None,
) -> float:
    value = f"{title} {url}".lower()
    score = 0.0

    exact_scores = {
        "interim financial statements": 50,
        "financial statements": 46,
        "états financiers": 46,
        "etats financiers": 46,
        "annual report": 37,
        "quarterly report": 36,
        "shareholder report": 33,
        "supplementary information": 30,
        "financial results": 22,
        "quarterly results": 22,
        "rapport trimestriel": 36,
        "rapport annuel": 37,
        "rapports financiers": 25,
    }

    for keyword, points in exact_scores.items():
        if keyword in value:
            score += points

    format_value = document_format(url)
    if format_value == "xlsx":
        score += 18
    elif format_value == "pdf":
        score += 12
    elif format_value == "html":
        score += 5

    if QUARTER_RE.search(value):
        score += 8

    years = [int(year) for year in YEAR_RE.findall(value)]
    current_year = current_year or datetime.now(UTC).year
    for year in years:
        if year == current_year:
            score += 16
        elif year == current_year - 1:
            score += 12
        elif year == current_year - 2:
            score += 7
        elif year < current_year - 6:
            score -= 8

    for keyword in NEGATIVE_KEYWORDS:
        if keyword in value:
            score -= 30

    return score


def published_at(
    title: str,
    url: str,
) -> datetime | None:
    value = f"{title} {url}"
    years = [
        int(year)
        for year in YEAR_RE.findall(value)
    ]
    if not years:
        return None

    year = max(years)
    quarter = QUARTER_RE.search(value)
    if quarter:
        quarter_number = next(
            (
                int(group)
                for group in quarter.groups()[:2]
                if group
            ),
            None,
        )
        if quarter_number is not None:
            month = quarter_number * 3
            return datetime(
                year,
                month,
                1,
                tzinfo=UTC,
            )

    return datetime(year, 12, 31, tzinfo=UTC)


def _base_host(url: str) -> str:
    host = urlparse(url).hostname or ""
    return host.removeprefix("www.").lower()


def _same_site(base_url: str, candidate_url: str) -> bool:
    base = _base_host(base_url)
    candidate = _base_host(candidate_url)
    return bool(
        base
        and candidate
        and (
            candidate == base
            or candidate.endswith(f".{base}")
            or base.endswith(f".{candidate}")
        )
    )


class IssuerFinancialDocumentsService:
    cache_ttl_seconds = 21_600
    max_pages = 24
    max_documents = 6
    max_document_bytes = 20_000_000

    def __init__(self) -> None:
        self._cache: dict[
            str,
            tuple[float, IssuerFinancialsResult],
        ] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    @property
    def headers(self) -> dict[str, str]:
        return {
            "User-Agent": (
                "Anatole/1.0 official-financial-documents "
                "(respectful issuer-site crawler)"
            ),
            "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8",
            "Accept": (
                "text/html,application/xhtml+xml,"
                "application/pdf,"
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet,*/*;q=0.7"
            ),
        }

    def _lock_for(self, ticker: str) -> asyncio.Lock:
        lock = self._locks.get(ticker)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[ticker] = lock
        return lock

    @staticmethod
    def _site_registry() -> dict:
        if not SITES_PATH.exists():
            return {"issuers": {}}
        try:
            payload = json.loads(
                SITES_PATH.read_text(
                    encoding="utf-8"
                )
            )
        except (OSError, ValueError):
            return {"issuers": {}}
        return (
            payload
            if isinstance(payload, dict)
            else {"issuers": {}}
        )

    def _website(
        self,
        ticker: str,
        website: str | None,
    ) -> tuple[str | None, list[str]]:
        normalized = (
            ticker.strip()
            .upper()
            .removesuffix(".TO")
        )
        issuer = (
            self._site_registry()
            .get("issuers", {})
            .get(normalized, {})
        )
        override = issuer.get("website")
        pages = issuer.get("investor_pages") or []

        selected = (
            str(override).strip()
            if override
            else (website or "").strip()
        )

        if selected and not selected.startswith(
            ("http://", "https://")
        ):
            selected = f"https://{selected}"

        return (
            selected or None,
            [
                str(page).strip()
                for page in pages
                if str(page).strip()
            ],
        )

    async def _robots(
        self,
        client: httpx.AsyncClient,
        website: str,
    ) -> tuple[RobotFileParser, list[str]]:
        parsed = urlparse(website)
        robots_url = (
            f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        )
        parser = RobotFileParser()
        parser.set_url(robots_url)
        sitemaps: list[str] = []

        try:
            response = await client.get(
                robots_url,
                timeout=6.0,
            )
            if response.status_code < 400:
                lines = response.text.splitlines()
                parser.parse(lines)
                for line in lines:
                    if line.lower().startswith("sitemap:"):
                        sitemap = line.split(":", 1)[1].strip()
                        if sitemap:
                            sitemaps.append(sitemap)
            else:
                parser.parse([])
        except httpx.HTTPError:
            parser.parse([])

        return parser, sitemaps

    async def _sitemap_urls(
        self,
        client: httpx.AsyncClient,
        sitemap_urls: Iterable[str],
    ) -> list[str]:
        output: list[str] = []
        queue = list(dict.fromkeys(sitemap_urls))[:5]
        seen: set[str] = set()

        while queue and len(seen) < 8:
            sitemap_url = queue.pop(0)
            if sitemap_url in seen:
                continue
            seen.add(sitemap_url)

            try:
                response = await client.get(
                    sitemap_url,
                    timeout=8.0,
                )
                if response.status_code >= 400:
                    continue
                root = ElementTree.fromstring(
                    response.content
                )
            except (
                httpx.HTTPError,
                ElementTree.ParseError,
            ):
                continue

            locations = [
                element.text.strip()
                for element in root.iter()
                if element.tag.endswith("loc")
                and element.text
            ]

            if root.tag.endswith("sitemapindex"):
                queue.extend(locations[:10])
                continue

            for location in locations:
                lowered = location.lower()
                if any(
                    keyword in lowered
                    for keyword in PAGE_KEYWORDS
                ):
                    output.append(location)

                if document_format(location):
                    output.append(location)

        return list(dict.fromkeys(output))[:80]

    @staticmethod
    def _links(html: str) -> list[tuple[str, str]]:
        parser = _LinkExtractor()
        parser.feed(html)
        parser.close()
        return parser.links

    def _candidate(
        self,
        href: str,
        title: str,
        origin_url: str,
        content_type: str | None = None,
    ) -> IssuerDocumentCandidate | None:
        url = normalize_url(
            urljoin(origin_url, href)
        )
        format_value = document_format(url)
        combined = f"{title} {url}".lower()

        if format_value is None:
            return None

        if not any(
            keyword in combined
            for keyword in FINANCIAL_KEYWORDS
        ):
            return None

        score = score_document(title, url)
        if score < 15:
            return None

        return IssuerDocumentCandidate(
            url=url,
            title=title.strip() or url.rsplit("/", 1)[-1],
            document_format=format_value,
            document_type=classify_document(
                title,
                url,
            ),
            score=score,
            origin_url=origin_url,
            content_type=content_type,
            published_at=published_at(
                title,
                url,
            ),
        )

    async def discover(
        self,
        ticker: str,
        website: str | None,
    ) -> tuple[
        str | None,
        list[IssuerDocumentCandidate],
        str | None,
    ]:
        website, override_pages = self._website(
            ticker,
            website,
        )
        if website is None:
            return None, [], "Site officiel non disponible."

        parsed = urlparse(website)
        if parsed.scheme not in {"http", "https"}:
            return website, [], "Adresse du site officiel invalide."

        base = f"{parsed.scheme}://{parsed.netloc}"
        candidates: dict[
            str,
            IssuerDocumentCandidate,
        ] = {}
        visited: set[str] = set()
        queue: list[str] = [
            website,
            *(
                urljoin(base, path)
                for path in COMMON_PATHS
            ),
            *(
                urljoin(base, page)
                for page in override_pages
            ),
        ]

        async with httpx.AsyncClient(
            headers=self.headers,
            timeout=httpx.Timeout(
                connect=7.0,
                read=10.0,
                write=7.0,
                pool=7.0,
            ),
            follow_redirects=True,
        ) as client:
            robots, robot_sitemaps = await self._robots(
                client,
                website,
            )
            default_sitemap = urljoin(
                base,
                "/sitemap.xml",
            )
            sitemap_pages = await self._sitemap_urls(
                client,
                [default_sitemap, *robot_sitemaps],
            )
            queue.extend(sitemap_pages)

            while queue and len(visited) < self.max_pages:
                page_url = normalize_url(queue.pop(0))

                if page_url in visited:
                    continue
                if not _same_site(website, page_url):
                    continue
                if not robots.can_fetch(
                    self.headers["User-Agent"],
                    page_url,
                ):
                    continue

                visited.add(page_url)

                if document_format(page_url):
                    candidate = self._candidate(
                        page_url,
                        page_url.rsplit("/", 1)[-1],
                        website,
                    )
                    if candidate is not None:
                        candidates[candidate.url] = candidate
                    continue

                try:
                    response = await client.get(
                        page_url
                    )
                except httpx.HTTPError:
                    continue

                if response.status_code >= 400:
                    continue

                content_type = response.headers.get(
                    "content-type",
                    "",
                ).lower()

                if "html" not in content_type:
                    continue

                for href, title in self._links(
                    response.text
                ):
                    absolute = normalize_url(
                        urljoin(page_url, href)
                    )
                    candidate = self._candidate(
                        absolute,
                        title,
                        page_url,
                    )

                    if candidate is not None:
                        existing = candidates.get(
                            candidate.url
                        )
                        if (
                            existing is None
                            or candidate.score
                            > existing.score
                        ):
                            candidates[
                                candidate.url
                            ] = candidate
                        continue

                    lowered = (
                        f"{title} {absolute}"
                    ).lower()
                    if (
                        _same_site(
                            website,
                            absolute,
                        )
                        and any(
                            keyword in lowered
                            for keyword in PAGE_KEYWORDS
                        )
                    ):
                        queue.append(absolute)

        ordered = sorted(
            candidates.values(),
            key=lambda item: (
                item.score,
                item.published_at
                or datetime.min.replace(tzinfo=UTC),
            ),
            reverse=True,
        )

        # Avoid downloading the PDF and XLSX edition of the same low-value
        # presentation while keeping genuinely complementary statements.
        return website, ordered[:18], None

    async def _download(
        self,
        client: httpx.AsyncClient,
        document: IssuerDocumentCandidate,
    ) -> bytes | None:
        try:
            async with client.stream(
                "GET",
                document.url,
            ) as response:
                if response.status_code >= 400:
                    return None

                length = response.headers.get(
                    "content-length"
                )
                if (
                    length
                    and int(length)
                    > self.max_document_bytes
                ):
                    return None

                chunks: list[bytes] = []
                size = 0

                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > self.max_document_bytes:
                        return None
                    chunks.append(chunk)

                return b"".join(chunks)
        except (
            httpx.HTTPError,
            ValueError,
        ):
            return None

    @staticmethod
    def _merge_document_periods(
        periods: list[FinancialPeriod],
    ) -> tuple[
        list[FinancialPeriod],
        list[FinancialPeriod],
    ]:
        merged: dict[
            tuple[datetime, str],
            FinancialPeriod,
        ] = {}

        for period in sorted(
            periods,
            key=lambda item: item.period_end,
            reverse=True,
        ):
            key = (
                period.period_end,
                period.period_type,
            )
            current = merged.get(key)

            if current is None:
                merged[key] = period
                continue

            data = current.model_dump()
            incoming = period.model_dump()

            for field, value in incoming.items():
                if (
                    value is not None
                    and field
                    not in {
                        "period_end",
                        "period_type",
                    }
                ):
                    data[field] = value

            merged[key] = FinancialPeriod(**data)

        annual = [
            period
            for period in merged.values()
            if period.period_type == "annual"
        ]
        quarterly = [
            period
            for period in merged.values()
            if period.period_type == "quarterly"
        ]

        return (
            sorted(
                annual,
                key=lambda item: item.period_end,
                reverse=True,
            )[:5],
            sorted(
                quarterly,
                key=lambda item: item.period_end,
                reverse=True,
            )[:12],
        )

    async def _load(
        self,
        ticker: str,
        website: str | None,
    ) -> IssuerFinancialsResult:
        resolved_website, documents, error = (
            await self.discover(
                ticker,
                website,
            )
        )

        if not documents:
            return IssuerFinancialsResult(
                ticker=ticker,
                website=resolved_website,
                annual=[],
                quarterly=[],
                documents=[],
                parsed_documents=0,
                error=error
                or "Aucun document financier officiel trouvé.",
            )

        all_periods: list[FinancialPeriod] = []
        parsed_documents = 0

        async with httpx.AsyncClient(
            headers=self.headers,
            timeout=httpx.Timeout(
                connect=7.0,
                read=18.0,
                write=7.0,
                pool=7.0,
            ),
            follow_redirects=True,
        ) as client:
            for document in documents[
                : self.max_documents
            ]:
                content = await self._download(
                    client,
                    document,
                )
                if not content:
                    continue

                try:
                    periods = (
                        financial_document_parser
                        .parse_bytes(
                            content,
                            document,
                        )
                    )
                except Exception:  # noqa: BLE001
                    periods = []

                if periods:
                    parsed_documents += 1
                    all_periods.extend(periods)

                # Enough for a useful quarterly balance, income statement
                # and cash-flow view; avoid unnecessary issuer traffic.
                populated = sum(
                    1
                    for period in all_periods
                    for field in (
                        "total_revenue",
                        "net_income",
                        "operating_cash_flow",
                        "capital_expenditure",
                        "total_cash",
                        "total_debt",
                        "current_assets",
                        "current_liabilities",
                        "total_assets",
                        "total_liabilities",
                        "stockholder_equity",
                    )
                    if getattr(period, field)
                    is not None
                )
                if (
                    parsed_documents >= 2
                    and populated >= 28
                ):
                    break

        annual, quarterly = (
            self._merge_document_periods(
                all_periods
            )
        )

        return IssuerFinancialsResult(
            ticker=ticker,
            website=resolved_website,
            annual=annual,
            quarterly=quarterly,
            documents=documents,
            parsed_documents=parsed_documents,
            error=(
                None
                if annual or quarterly
                else (
                    "Des documents ont été trouvés, mais leur mise "
                    "en page n'a pas permis une extraction suffisamment "
                    "fiable."
                )
            ),
        )

    async def get_financials(
        self,
        ticker: str,
        website: str | None,
        *,
        force_refresh: bool = False,
    ) -> IssuerFinancialsResult:
        key = ticker.strip().upper()
        cached = self._cache.get(key)
        now = monotonic()

        if (
            not force_refresh
            and cached is not None
            and now - cached[0]
            < self.cache_ttl_seconds
        ):
            return cached[1]

        async with self._lock_for(key):
            cached = self._cache.get(key)
            now = monotonic()

            if (
                not force_refresh
                and cached is not None
                and now - cached[0]
                < self.cache_ttl_seconds
            ):
                return cached[1]

            try:
                async with asyncio.timeout(28):
                    result = await self._load(
                        key,
                        website,
                    )
            except TimeoutError:
                result = IssuerFinancialsResult(
                    ticker=key,
                    website=website,
                    annual=[],
                    quarterly=[],
                    documents=[],
                    parsed_documents=0,
                    error=(
                        "Le site investisseurs n'a pas répondu "
                        "dans le délai prévu."
                    ),
                )

            self._cache[key] = (
                monotonic(),
                result,
            )
            return result

    async def diagnostics(
        self,
        ticker: str,
        website: str | None,
        *,
        force_refresh: bool = False,
    ) -> IssuerDocumentDiagnostics:
        result = await self.get_financials(
            ticker,
            website,
            force_refresh=force_refresh,
        )
        periods = result.annual + result.quarterly
        fields = sum(
            1
            for period in periods
            for field in (
                "total_revenue",
                "operating_income",
                "net_income",
                "operating_cash_flow",
                "capital_expenditure",
                "total_cash",
                "total_debt",
                "current_assets",
                "current_liabilities",
                "total_assets",
                "total_liabilities",
                "stockholder_equity",
            )
            if getattr(period, field) is not None
        )

        return IssuerDocumentDiagnostics(
            ticker=ticker.strip().upper(),
            website=result.website,
            status=(
                "available"
                if fields >= 16
                else "partial"
                if result.documents
                else "unavailable"
            ),
            documents=result.documents,
            parsed_periods=len(periods),
            parsed_fields=fields,
            error=result.error,
            generated_at=datetime.now(UTC),
        )


issuer_financial_documents_service = (
    IssuerFinancialDocumentsService()
)
