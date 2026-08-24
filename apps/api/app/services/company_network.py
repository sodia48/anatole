from __future__ import annotations

import asyncio
import logging
import threading
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Iterable

import httpx
from sqlalchemy import Column, Index, MetaData, String, Table, Text, insert, or_, select, update

from app.core.config import settings
from app.core.resilience import shared_http_client
from app.schemas.company_network import (
    CompanyNetworkCoverage,
    CompanyNetworkEvidenceResponse,
    CompanyNetworkNode,
    CompanyNetworkSnapshot,
    CompanyNetworkSourceStatus,
    CompanyRelationship,
    CompanyRelationshipPath,
    RelationshipEvidence,
    RelationshipEvidenceGroup,
    SectorExposure,
)
from app.schemas.fundamentals import IssuerDocumentCandidate
from app.services.accounts import account_service
from app.services.company_relationship_extractor import (
    CompanyEntityIndex,
    RelationshipDocument,
    company_relationship_extractor,
    merge_relationships,
    node_id,
    relationship_id,
)
from app.services.fundamentals import fundamentals_service
from app.services.issuer_document_parser import financial_document_parser
from app.services.issuer_documents import issuer_financial_documents_service
from app.services.sec_edgar import sec_edgar_financials_provider
from app.services.tsx60 import TSX60
from app.services.tsx_composite_universe import tsx_composite_universe_service


FINNHUB_SUPPLY_CHAIN_URL = "https://finnhub.io/api/v1/stock/supply-chain"
FINNHUB_SUPPLY_CHAIN_SOURCE_URL = "https://finnhub.io/docs/api/supply-chain"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}"
NETWORK_CACHE_SECONDS = 86_400
MAX_NODES = 40
MAX_RELATIONSHIPS = 80
MAX_DEPTH_TWO_COMPANIES = 8
MAX_RELATIONSHIP_DOCUMENTS = 2
RELATIONSHIP_PDF_PAGE_LIMIT = 30
BUILD_RETRY_AFTER_SECONDS = 3


logger = logging.getLogger("anatole.api.company_network")


US_COMPANIES: tuple[tuple[str, str, str], ...] = (
    ("AAPL", "Apple Inc.", "Information Technology"),
    ("AMZN", "Amazon.com, Inc.", "Consumer Discretionary"),
    ("GOOGL", "Alphabet Inc.", "Communication Services"),
    ("META", "Meta Platforms, Inc.", "Communication Services"),
    ("MSFT", "Microsoft Corporation", "Information Technology"),
    ("NVDA", "NVIDIA Corporation", "Information Technology"),
    ("GSAT", "Globalstar, Inc.", "Communication Services"),
    ("TSM", "Taiwan Semiconductor Manufacturing Company Limited", "Information Technology"),
    ("TSLA", "Tesla, Inc.", "Consumer Discretionary"),
)
VALIDATED_ALIASES: dict[str, tuple[str, ...]] = {
    "RY": ("RBC", "Royal Bank"),
    "TD": ("TD Bank", "Toronto-Dominion Bank"),
    "CNR": ("CN", "Canadian National"),
    "CP": ("CPKC", "Canadian Pacific Kansas City"),
    "SHOP": ("Shopify",),
    "MSFT": ("Microsoft",),
    "AAPL": ("Apple",),
    "AMZN": ("Amazon",),
    "GOOGL": ("Google", "Alphabet"),
    "META": ("Meta", "Facebook"),
    "NVDA": ("NVIDIA",),
    "GSAT": ("Globalstar",),
    "TSM": ("TSMC", "Taiwan Semiconductor"),
    "TSLA": ("Tesla",),
}


def _relationship_document_candidates(
    documents: Iterable[IssuerDocumentCandidate],
) -> list[IssuerDocumentCandidate]:
    supported = [
        item
        for item in documents
        if item.document_format in {"pdf", "html"}
    ]
    annual = sorted(
        (
            item
            for item in supported
            if item.document_type == "annual"
        ),
        key=lambda item: (
            item.published_at
            or datetime.min.replace(tzinfo=UTC),
            item.score,
        ),
        reverse=True,
    )
    other = [
        item
        for item in supported
        if item.document_type != "annual"
    ]

    # Annual reports carry the broadest issuer-reviewed disclosures about
    # customers, suppliers, contracts and partnerships. Prefer recent annual
    # reports and fill any remaining bounded slot with the crawler's highest
    # scoring interim material.
    selected = annual[:MAX_RELATIONSHIP_DOCUMENTS]
    if len(selected) < MAX_RELATIONSHIP_DOCUMENTS:
        selected.extend(
            other[
                : MAX_RELATIONSHIP_DOCUMENTS
                - len(selected)
            ]
        )
    return selected[:MAX_RELATIONSHIP_DOCUMENTS]


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_ticker(value: str) -> str:
    return value.strip().upper().removesuffix(".TO").replace("/", ".")


def _node(
    ticker: str | None,
    name: str,
    *,
    exchange: str | None = None,
    country: str | None = None,
    sector: str | None = None,
    industry: str | None = None,
    public: bool = True,
) -> CompanyNetworkNode:
    normalized = _normalize_ticker(ticker) if ticker else None
    return CompanyNetworkNode(
        id=node_id(normalized, name),
        ticker=normalized,
        name=name,
        exchange=exchange,
        country=country,
        sector=sector,
        industry=industry,
        public_company=public,
        node_type="company" if public else "private_company",
    )


@dataclass(slots=True)
class ProviderResult:
    nodes: list[CompanyNetworkNode]
    relationships: list[CompanyRelationship]
    status: CompanyNetworkSourceStatus
    documents_scanned: int = 0


class CompanyResolver:
    def __init__(self) -> None:
        self._tsx60: dict[str, CompanyNetworkNode] = {
            item.symbol: _node(
                item.symbol,
                item.name,
                exchange="TSX",
                country="Canada",
                sector=item.sector,
            )
            for item in TSX60
        }
        self._us: dict[str, CompanyNetworkNode] = {
            ticker: _node(
                ticker,
                name,
                exchange="NASDAQ/NYSE",
                country="United States",
                sector=sector,
            )
            for ticker, name, sector in US_COMPANIES
        }

    async def resolve(self, ticker: str) -> CompanyNetworkNode:
        symbol = _normalize_ticker(ticker)
        known = self._tsx60.get(symbol) or self._us.get(symbol)
        if known:
            return known
        composite = await tsx_composite_universe_service.find(symbol)
        if composite:
            return _node(
                composite.ticker,
                composite.name,
                exchange=composite.exchange or "TSX",
                country="Canada",
                sector=composite.sector,
            )
        try:
            snapshot = await fundamentals_service.get_snapshot(symbol)
        except Exception:  # noqa: BLE001
            snapshot = None
        if snapshot and snapshot.name and snapshot.name != symbol:
            return _node(
                symbol,
                snapshot.name,
                exchange=snapshot.exchange,
                country=None,
                sector=snapshot.sector,
                industry=snapshot.industry,
            )
        # The requested ticker is user input, not an inferred ticker. Keep it
        # unresolved and clearly labelled instead of inventing a company name.
        return _node(symbol, symbol, public=True)

    async def index(self, center: CompanyNetworkNode) -> CompanyEntityIndex:
        nodes = list(self._tsx60.values()) + list(self._us.values())
        try:
            constituents = await tsx_composite_universe_service.get_constituents()
        except Exception:  # noqa: BLE001
            constituents = []
        seen = {node.ticker for node in nodes}
        for item in constituents:
            if item.ticker in seen:
                continue
            nodes.append(_node(item.ticker, item.name, exchange=item.exchange or "TSX", country="Canada", sector=item.sector))
        if center.id not in {node.id for node in nodes}:
            nodes.append(center)
        index = CompanyEntityIndex()
        for item in nodes:
            index.add(item, VALIDATED_ALIASES.get(item.ticker or "", ()))
        return index


class FinnhubSupplyChainProvider:
    cache_ttl_seconds = NETWORK_CACHE_SECONDS

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport
        self._cache: dict[str, tuple[float, ProviderResult]] = {}

    @staticmethod
    def _correlation(row: dict[str, Any], *names: str) -> float | None:
        for name in names:
            value = row.get(name)
            if isinstance(value, (int, float)) and -1 <= float(value) <= 1:
                return float(value)
        return None

    async def load(self, center: CompanyNetworkNode, *, refresh: bool = False) -> ProviderResult:
        symbol = center.ticker or ""
        cached = self._cache.get(symbol)
        if not refresh and cached and monotonic() - cached[0] < self.cache_ttl_seconds:
            return cached[1]
        if not settings.finnhub_api_key:
            return ProviderResult(
                [],
                [],
                CompanyNetworkSourceStatus(
                    source="Finnhub Supply Chain",
                    status="unavailable",
                    detail="Finnhub Supply Chain non disponible pour ce compte.",
                    detail_en="Finnhub Supply Chain is not available for this account.",
                ),
            )
        try:
            async with httpx.AsyncClient(
                transport=self.transport,
                timeout=8.0,
                follow_redirects=True,
            ) as client:
                response = await client.get(
                    FINNHUB_SUPPLY_CHAIN_URL,
                    params={"symbol": symbol, "token": settings.finnhub_api_key},
                    headers={"X-Finnhub-Token": settings.finnhub_api_key},
                )
            if response.status_code in {401, 402, 403}:
                detail = "Finnhub Supply Chain non disponible pour ce compte (premium requis)."
                return ProviderResult([], [], CompanyNetworkSourceStatus(
                    source="Finnhub Supply Chain",
                    status="unavailable",
                    detail=detail,
                    detail_en="Finnhub Supply Chain is not available for this account (premium access required).",
                ))
            response.raise_for_status()
            payload = response.json()
            rows = payload.get("data", payload) if isinstance(payload, dict) else payload
            if not isinstance(rows, list):
                raise ValueError("Réponse Finnhub Supply Chain invalide.")
        except (httpx.HTTPError, TimeoutError, ValueError) as exc:
            detail = "Délai d’attente Finnhub dépassé." if isinstance(exc, httpx.TimeoutException) else f"Finnhub Supply Chain indisponible ({type(exc).__name__})."
            return ProviderResult([], [], CompanyNetworkSourceStatus(
                source="Finnhub Supply Chain",
                status="unavailable",
                detail=detail,
                detail_en=(
                    "Finnhub Supply Chain timed out."
                    if isinstance(exc, httpx.TimeoutException)
                    else f"Finnhub Supply Chain is unavailable ({type(exc).__name__})."
                ),
            ))

        nodes: dict[str, CompanyNetworkNode] = {}
        relationships: list[CompanyRelationship] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or "").strip()
            returned_symbol = str(row.get("symbol") or "").strip().upper() or None
            if not name:
                continue
            entity = _node(
                returned_symbol,
                name,
                country=str(row.get("country") or "").strip() or None,
                industry=str(row.get("industry") or "").strip() or None,
                public=bool(returned_symbol),
            )
            nodes[entity.id] = entity
            flags = (("customer", bool(row.get("customer"))), ("supplier", bool(row.get("supplier"))))
            for relationship_type, enabled in flags:
                if not enabled:
                    continue
                source, target = (center, entity) if relationship_type == "customer" else (entity, center)
                relationship_identifier = relationship_id(source.id, target.id, relationship_type)
                evidence = RelationshipEvidence(
                    id=node_id(None, f"{relationship_identifier}|finnhub"),
                    relationship_id=relationship_identifier,
                    source_type="finnhub",
                    title="Finnhub Supply Chain",
                    url=FINNHUB_SUPPLY_CHAIN_SOURCE_URL,
                    published_at=None,
                    document_date=None,
                    excerpt=(
                        f"name={name}; symbol={returned_symbol or 'null'}; "
                        f"customer={str(bool(row.get('customer'))).lower()}; "
                        f"supplier={str(bool(row.get('supplier'))).lower()}"
                    ),
                    issuer="Finnhub",
                )
                relationships.append(CompanyRelationship(
                    id=relationship_identifier,
                    source_node_id=source.id,
                    target_node_id=target.id,
                    relationship_type=relationship_type,
                    status="unknown",
                    confidence="secondary",
                    materiality="unknown",
                    source_count=1,
                    last_verified_at=None,
                    evidence=[evidence],
                    correlation_2w=self._correlation(row, "correlation2Week", "correlation_2w"),
                    correlation_1m=self._correlation(row, "correlation1Month", "correlation_1m"),
                    correlation_3m=self._correlation(row, "correlation3Month", "correlation_3m"),
                    correlation_6m=self._correlation(row, "correlation6Month", "correlation_6m"),
                    correlation_1y=self._correlation(row, "correlation1Year", "correlation_1y"),
                    correlation_2y=self._correlation(row, "correlation2Year", "correlation_2y"),
                ))
        result = ProviderResult(
            list(nodes.values()),
            merge_relationships(relationships),
            CompanyNetworkSourceStatus(
                source="Finnhub Supply Chain",
                status="available" if relationships else "partial",
                count=len(relationships),
                detail=(
                    f"{len(relationships)} relation(s) structurée(s) reçue(s). Corrélation affichée séparément; elle ne prouve aucune causalité."
                    if relationships else "Endpoint accessible, sans relation publiée pour ce symbole."
                ),
                detail_en=(
                    f"{len(relationships)} structured relationship(s) received. Market correlation is shown separately and does not prove causation."
                    if relationships else "The endpoint is accessible but publishes no relationship for this symbol."
                ),
            ),
        )
        self._cache[symbol] = (monotonic(), result)
        return result


class OfficialRelationshipProvider:
    def __init__(self) -> None:
        self._document_semaphore = asyncio.Semaphore(3)
        self._sec_semaphore = asyncio.Semaphore(1)
        self._cpu_executor = ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="company-network-cpu",
        )

    async def close(self) -> None:
        self._cpu_executor.shutdown(wait=False, cancel_futures=True)

    @staticmethod
    def _extract_document_sync(
        center: CompanyNetworkNode,
        index: CompanyEntityIndex,
        content: bytes,
        candidate: IssuerDocumentCandidate,
        source_type: str,
    ) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]] | None:
        text = financial_document_parser.extract_text(
            content,
            candidate,
            max_pdf_pages=RELATIONSHIP_PDF_PAGE_LIMIT,
        )
        if not text:
            return None
        return company_relationship_extractor.extract(
            center,
            RelationshipDocument(
                source_type=source_type,
                title=candidate.title,
                url=candidate.url,
                text=text,
                issuer=center.name,
                published_at=candidate.published_at,
                document_date=candidate.published_at,
            ),
            index,
        )

    async def _extract_document(
        self,
        center: CompanyNetworkNode,
        index: CompanyEntityIndex,
        content: bytes,
        candidate: IssuerDocumentCandidate,
        source_type: str,
    ) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]] | None:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._cpu_executor,
            self._extract_document_sync,
            center,
            index,
            content,
            candidate,
            source_type,
        )

    async def _issuer_document(
        self,
        center: CompanyNetworkNode,
        index: CompanyEntityIndex,
        candidate: IssuerDocumentCandidate,
    ) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]] | None:
        async with self._document_semaphore:
            content = await issuer_financial_documents_service.download_document(candidate)
        if not content:
            return None
        try:
            source_type = "annual_report" if candidate.document_type == "annual" else "investor_relations"
            return await self._extract_document(
                center,
                index,
                content,
                candidate,
                source_type,
            )
        except Exception:  # noqa: BLE001
            return None

    async def issuer_documents(
        self,
        center: CompanyNetworkNode,
        index: CompanyEntityIndex,
        *,
        refresh: bool,
    ) -> ProviderResult:
        try:
            fundamentals = await fundamentals_service.get_snapshot(center.ticker or center.name)
            _, documents, discovery_error = (
                await issuer_financial_documents_service.discover(
                    center.ticker or center.name,
                    fundamentals.website,
                )
            )
        except Exception as exc:  # noqa: BLE001
            return ProviderResult([], [], CompanyNetworkSourceStatus(
                source="Documents officiels",
                status="unavailable",
                detail=f"Documents officiels indisponibles ({type(exc).__name__}).",
                detail_en=f"Official documents are unavailable ({type(exc).__name__}).",
            ))
        candidates = _relationship_document_candidates(documents)
        extracted = await asyncio.gather(
            *(self._issuer_document(center, index, item) for item in candidates),
            return_exceptions=True,
        )
        nodes: dict[str, CompanyNetworkNode] = {}
        relationships: list[CompanyRelationship] = []
        scanned = 0
        for item in extracted:
            if isinstance(item, Exception) or item is None:
                continue
            scanned += 1
            item_nodes, item_relationships = item
            nodes.update({node.id: node for node in item_nodes})
            relationships.extend(item_relationships)
        status = "available" if scanned else "partial" if candidates else "unavailable"
        detail = (
            f"{scanned}/{len(candidates)} document(s) IR officiel(s) analysé(s) par règles déterministes."
            if candidates
            else discovery_error
            or "Aucun rapport annuel ou document IR exploitable n’a été trouvé."
        )
        return ProviderResult(
            list(nodes.values()),
            merge_relationships(relationships),
            CompanyNetworkSourceStatus(
                source="Documents officiels",
                status=status,
                count=len(relationships),
                detail=detail,
                detail_en=(
                    f"{scanned}/{len(candidates)} official IR document(s) analyzed with deterministic rules."
                    if candidates else "No usable annual report or IR document was found."
                ),
            ),
            documents_scanned=scanned,
        )

    async def sec_documents(
        self,
        center: CompanyNetworkNode,
        index: CompanyEntityIndex,
    ) -> ProviderResult:
        if not center.ticker:
            return ProviderResult([], [], CompanyNetworkSourceStatus(
                source="SEC",
                status="unavailable",
                detail="Entreprise sans ticker SEC résoluble.",
                detail_en="The company has no resolvable SEC ticker.",
            ))
        try:
            resolved = await sec_edgar_financials_provider.resolve_cik(center.ticker)
            if not resolved:
                return ProviderResult([], [], CompanyNetworkSourceStatus(
                    source="SEC",
                    status="unavailable",
                    detail="Aucun identifiant SEC vérifié pour ce ticker.",
                    detail_en="No verified SEC identifier was found for this ticker.",
                ))
            cik, _ = resolved
            headers = dict(sec_edgar_financials_provider.headers)
            headers.pop("Host", None)
            async with self._sec_semaphore:
                response = await shared_http_client.request("GET", SEC_SUBMISSIONS_URL.format(cik=cik), headers=headers, attempts=1)
            payload = response.json()
            recent = payload.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            accessions = recent.get("accessionNumber", [])
            documents = recent.get("primaryDocument", [])
            filing_dates = recent.get("filingDate", [])
        except Exception as exc:  # noqa: BLE001
            return ProviderResult([], [], CompanyNetworkSourceStatus(
                source="SEC",
                status="unavailable",
                detail=f"SEC indisponible ({type(exc).__name__}).",
                detail_en=f"SEC is unavailable ({type(exc).__name__}).",
            ))

        candidates: list[tuple[str, str, datetime | None]] = []
        for form, accession, document, filing_date in zip(forms, accessions, documents, filing_dates):
            if form not in {"10-K", "20-F", "10-Q", "40-F"} or not document:
                continue
            accession_clean = str(accession).replace("-", "")
            url = SEC_ARCHIVES_URL.format(cik=int(cik), accession=accession_clean, document=document)
            try:
                parsed_date = datetime.fromisoformat(str(filing_date)).replace(tzinfo=UTC)
            except ValueError:
                parsed_date = None
            candidates.append((form, url, parsed_date))
            if len(candidates) >= 2:
                break

        nodes: dict[str, CompanyNetworkNode] = {}
        relationships: list[CompanyRelationship] = []
        scanned = 0
        for form, url, filed_at in candidates:
            try:
                async with self._sec_semaphore:
                    response = await shared_http_client.request("GET", url, headers=headers, attempts=1)
                    await asyncio.sleep(0.11)
                candidate = IssuerDocumentCandidate(
                    url=url,
                    title=f"SEC {form}",
                    document_format="html",
                    document_type="annual" if form in {"10-K", "20-F", "40-F"} else "quarterly",
                    score=100,
                    origin_url=url,
                    content_type=response.headers.get("content-type"),
                    published_at=filed_at,
                )
                extracted = await self._extract_document(
                    center,
                    index,
                    response.content,
                    candidate,
                    "sec",
                )
                if extracted is None:
                    continue
                item_nodes, item_relationships = extracted
                nodes.update({node.id: node for node in item_nodes})
                relationships.extend(item_relationships)
                scanned += 1
            except Exception:  # noqa: BLE001
                continue
        status = "available" if scanned else "partial" if candidates else "unavailable"
        return ProviderResult(
            list(nodes.values()),
            merge_relationships(relationships),
            CompanyNetworkSourceStatus(
                source="SEC",
                status=status,
                count=len(relationships),
                detail=(f"{scanned}/{len(candidates)} dépôt(s) SEC analysé(s)." if candidates else "Aucun 10-K, 20-F, 40-F ou 10-Q pertinent trouvé."),
                detail_en=(f"{scanned}/{len(candidates)} SEC filing(s) analyzed." if candidates else "No relevant 10-K, 20-F, 40-F or 10-Q was found."),
            ),
            documents_scanned=scanned,
        )


class CompanyNetworkStore:
    def __init__(self) -> None:
        self.account_service = account_service
        self.metadata = MetaData()
        self.entities = Table(
            "company_network_entities",
            self.metadata,
            Column("id", String(120), primary_key=True),
            Column("ticker", String(20), nullable=True, index=True),
            Column("payload", Text, nullable=False),
            Column("updated_at", String(40), nullable=False),
        )
        self.relationships = Table(
            "company_network_relationships",
            self.metadata,
            Column("id", String(120), primary_key=True),
            Column("source_node_id", String(120), nullable=False, index=True),
            Column("target_node_id", String(120), nullable=False, index=True),
            Column("relationship_type", String(40), nullable=False),
            Column("confidence", String(20), nullable=False),
            Column("payload", Text, nullable=False),
            Column("updated_at", String(40), nullable=False),
        )
        self.evidence = Table(
            "company_network_evidence",
            self.metadata,
            Column("id", String(120), primary_key=True),
            Column("relationship_id", String(120), nullable=False, index=True),
            Column("source_type", String(40), nullable=False),
            Column("url", Text, nullable=False),
            Column("payload", Text, nullable=False),
            Column("updated_at", String(40), nullable=False),
        )
        Index("ix_company_network_edge", self.relationships.c.source_node_id, self.relationships.c.target_node_id)
        self._schema_lock = threading.Lock()
        self._started = False

    async def start(self) -> None:
        await self.account_service.start()
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        if self._started:
            return
        with self._schema_lock:
            if self._started:
                return
            self.metadata.create_all(self.account_service.engine)
            self._started = True

    @staticmethod
    def _upsert(connection: Any, table: Table, key: str, values: dict[str, Any]) -> None:
        result = connection.execute(update(table).where(table.c.id == key).values(**values))
        if result.rowcount == 0:
            connection.execute(insert(table).values(id=key, **values))

    async def save(self, nodes: Iterable[CompanyNetworkNode], relationships: Iterable[CompanyRelationship]) -> None:
        await self.start()
        await asyncio.to_thread(self._save_sync, list(nodes), list(relationships))

    def _save_sync(self, nodes: list[CompanyNetworkNode], relationships: list[CompanyRelationship]) -> None:
        now = _utc_now().isoformat()
        with self.account_service.engine.begin() as connection:
            for node in nodes:
                self._upsert(connection, self.entities, node.id, {
                    "ticker": node.ticker,
                    "payload": node.model_dump_json(),
                    "updated_at": now,
                })
            for relationship in relationships:
                self._upsert(connection, self.relationships, relationship.id, {
                    "source_node_id": relationship.source_node_id,
                    "target_node_id": relationship.target_node_id,
                    "relationship_type": relationship.relationship_type,
                    "confidence": relationship.confidence,
                    "payload": relationship.model_dump_json(),
                    "updated_at": now,
                })
                for evidence in relationship.evidence:
                    self._upsert(connection, self.evidence, evidence.id, {
                        "relationship_id": relationship.id,
                        "source_type": evidence.source_type,
                        "url": str(evidence.url),
                        "payload": evidence.model_dump_json(),
                        "updated_at": now,
                    })

    async def graph(self, center: CompanyNetworkNode, *, depth: int, include_secondary: bool) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]]:
        await self.start()
        return await asyncio.to_thread(self._graph_sync, center, depth, include_secondary)

    def _graph_sync(self, center: CompanyNetworkNode, depth: int, include_secondary: bool) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]]:
        with self.account_service.engine.connect() as connection:
            frontier = {center.id}
            all_ids = {center.id}
            relationships: dict[str, CompanyRelationship] = {}
            for _ in range(depth):
                if not frontier or len(all_ids) >= MAX_NODES:
                    break
                statement = select(self.relationships.c.payload).where(or_(
                    self.relationships.c.source_node_id.in_(frontier),
                    self.relationships.c.target_node_id.in_(frontier),
                ))
                for row in connection.execute(statement):
                    item = CompanyRelationship.model_validate_json(row.payload)
                    if not include_secondary and item.confidence == "secondary":
                        continue
                    relationships[item.id] = item
                    all_ids.update((item.source_node_id, item.target_node_id))
                next_frontier = all_ids - {center.id}
                frontier = next_frontier if depth > 1 else set()
            # Return one sentinel node beyond the public limit so the service
            # can report truncation truthfully before enforcing 40 visible nodes.
            node_rows = connection.execute(select(self.entities.c.payload).where(self.entities.c.id.in_(list(all_ids)[: MAX_NODES + 1])))
            nodes = [CompanyNetworkNode.model_validate_json(row.payload) for row in node_rows]
        node_ids = {item.id for item in nodes}
        filtered = [item for item in relationships.values() if item.source_node_id in node_ids and item.target_node_id in node_ids]
        return nodes, filtered[:MAX_RELATIONSHIPS]

    async def all_graph(self, include_secondary: bool) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]]:
        await self.start()
        return await asyncio.to_thread(self._all_graph_sync, include_secondary)

    def _all_graph_sync(self, include_secondary: bool) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]]:
        with self.account_service.engine.connect() as connection:
            nodes = [CompanyNetworkNode.model_validate_json(row.payload) for row in connection.execute(select(self.entities.c.payload))]
            relationships = [CompanyRelationship.model_validate_json(row.payload) for row in connection.execute(select(self.relationships.c.payload))]
        if not include_secondary:
            relationships = [item for item in relationships if item.confidence != "secondary"]
        return nodes, relationships


def _sector_exposure(nodes: Iterable[CompanyNetworkNode], relationships: Iterable[CompanyRelationship], center_id: str) -> list[SectorExposure]:
    by_id = {node.id: node for node in nodes}
    counts: dict[str, int] = {}
    quantified: dict[str, float] = {}
    for relationship in relationships:
        other_id = relationship.target_node_id if relationship.source_node_id == center_id else relationship.source_node_id
        sector = by_id.get(other_id).sector if by_id.get(other_id) else None
        if not sector or relationship.confidence == "secondary":
            continue
        counts[sector] = counts.get(sector, 0) + 1
        if relationship.revenue_share_percent is not None:
            quantified[sector] = quantified.get(sector, 0) + relationship.revenue_share_percent
    return [
        SectorExposure(
            sector=sector,
            verified_relationship_count=count,
            quantified_revenue_share_percent=min(100, quantified[sector]) if sector in quantified else None,
        )
        for sector, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def _persisted_source_statuses(
    relationships: Iterable[CompanyRelationship],
) -> list[CompanyNetworkSourceStatus]:
    items = list(relationships)
    evidence = [entry for item in items for entry in item.evidence]
    official_types = {"issuer_filing", "annual_report", "sedar", "investor_relations", "press_release"}
    official_count = sum(entry.source_type in official_types for entry in evidence)
    sec_count = sum(entry.source_type == "sec" for entry in evidence)
    ir_count = sum(entry.source_type in {"issuer_filing", "annual_report", "sedar", "investor_relations"} for entry in evidence)
    finnhub_count = sum(entry.source_type == "finnhub" for entry in evidence)
    return [
        CompanyNetworkSourceStatus(
            source="Documents officiels",
            status="available" if official_count else "partial",
            count=official_count,
            detail="Preuves officielles servies depuis le stockage public durable.",
            detail_en="Official evidence served from durable public storage.",
        ),
        CompanyNetworkSourceStatus(
            source="SEC",
            status="available" if sec_count else "partial",
            count=sec_count,
            detail="Dépôts SEC conservés avec leurs URL d’origine; aucune nouvelle vérification réseau pour cette lecture en cache.",
            detail_en="SEC filings retain their original URLs; this cached read did not perform a new network verification.",
        ),
        CompanyNetworkSourceStatus(
            source="SEDAR+/IR",
            status="available" if ir_count else "partial",
            count=ir_count,
            detail="Documents SEDAR+/IR conservés avec leurs preuves traçables.",
            detail_en="SEDAR+/IR documents retained with their traceable evidence.",
        ),
        CompanyNetworkSourceStatus(
            source="Finnhub Supply Chain",
            status="available" if finnhub_count else "unavailable",
            count=finnhub_count,
            detail=(
                "Relations Finnhub secondaires servies depuis le cache durable."
                if finnhub_count else "Finnhub Supply Chain non disponible dans les preuves conservées."
            ),
            detail_en=(
                "Secondary Finnhub relationships served from durable cache."
                if finnhub_count else "Finnhub Supply Chain is not available in the retained evidence."
            ),
        ),
    ]


class CompanyNetworkService:
    cache_ttl_seconds = NETWORK_CACHE_SECONDS

    def __init__(
        self,
        *,
        resolver: CompanyResolver | None = None,
        store: CompanyNetworkStore | None = None,
        official_provider: OfficialRelationshipProvider | None = None,
        finnhub_provider: FinnhubSupplyChainProvider | None = None,
    ) -> None:
        self.resolver = resolver or CompanyResolver()
        self.store = store or CompanyNetworkStore()
        self.official_provider = official_provider or OfficialRelationshipProvider()
        self.finnhub_provider = finnhub_provider or FinnhubSupplyChainProvider()
        self._cache: dict[tuple[str, int, bool], tuple[float, CompanyNetworkSnapshot]] = {}
        self._build_tasks: dict[tuple[str, int, bool], asyncio.Task[None]] = {}
        self._build_errors: dict[tuple[str, int, bool], str] = {}
        self._global_build_semaphore = asyncio.Semaphore(
            settings.company_network_build_concurrency
        )
        self._active_builds = 0

    async def start(self) -> None:
        await self.store.start()

    async def close(self) -> None:
        tasks = list(self._build_tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        close_provider = getattr(self.official_provider, "close", None)
        if close_provider is not None:
            result = close_provider()
            if asyncio.iscoroutine(result):
                await result

    def readiness(self) -> dict[str, int]:
        return {
            "active_builds": self._active_builds,
            "queued_or_running": len(self._build_tasks),
            "cached_snapshots": len(self._cache),
        }

    def _has_fresh_cache(self, key: tuple[str, int, bool]) -> bool:
        cached = self._cache.get(key)
        return bool(
            cached and monotonic() - cached[0] < self.cache_ttl_seconds
        )

    async def _build_depth_one(self, center: CompanyNetworkNode, *, refresh: bool) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship], list[CompanyNetworkSourceStatus], int]:
        index = await self.resolver.index(center)
        issuer_result, sec_result, finnhub_result = await asyncio.gather(
            self.official_provider.issuer_documents(center, index, refresh=refresh),
            self.official_provider.sec_documents(center, index),
            self.finnhub_provider.load(center, refresh=refresh),
        )
        nodes = {center.id: center}
        relationships: list[CompanyRelationship] = []
        for result in (issuer_result, sec_result, finnhub_result):
            nodes.update({node.id: node for node in result.nodes})
            relationships.extend(result.relationships)
        merged = merge_relationships(relationships)
        await self.store.save(nodes.values(), merged)
        sources = [
            issuer_result.status,
            sec_result.status,
            CompanyNetworkSourceStatus(
                source="SEDAR+/IR",
                status=issuer_result.status.status,
                count=sum(1 for item in merged for evidence in item.evidence if evidence.source_type in {"sedar", "investor_relations", "annual_report", "issuer_filing"}),
                detail="Les liens IR/SEDAR+ ne sont retenus que lorsqu’un document officiel exploitable est identifié.",
                detail_en="IR/SEDAR+ links are retained only when a usable official document is identified.",
            ),
            finnhub_result.status,
        ]
        scanned = issuer_result.documents_scanned + sec_result.documents_scanned
        return list(nodes.values()), merged, sources, scanned

    @staticmethod
    def _public_build_error() -> str:
        return "L'analyse du réseau a échoué temporairement."

    def _snapshot(
        self,
        center: CompanyNetworkNode,
        nodes: Iterable[CompanyNetworkNode],
        relationships: Iterable[CompanyRelationship],
        *,
        depth: int,
        include_secondary: bool,
        sources: list[CompanyNetworkSourceStatus] | None = None,
        documents_scanned: int = 0,
        build_status: str = "ready",
        build_error: str | None = None,
        stale: bool = False,
    ) -> CompanyNetworkSnapshot:
        node_map = {node.id: node for node in nodes}
        node_map[center.id] = center
        ordered_nodes = [center] + [
            node for node in node_map.values() if node.id != center.id
        ]
        truncated = len(ordered_nodes) > MAX_NODES
        ordered_nodes = ordered_nodes[:MAX_NODES]
        visible = {node.id for node in ordered_nodes}
        visible_relationships = [
            item
            for item in relationships
            if item.source_node_id in visible
            and item.target_node_id in visible
            and (include_secondary or item.confidence != "secondary")
        ][:MAX_RELATIONSHIPS]
        counts = {
            value: sum(
                item.confidence == value for item in visible_relationships
            )
            for value in ("verified", "corroborated", "secondary")
        }
        empty_ready = build_status == "ready" and not visible_relationships
        if build_status == "building":
            message_fr = "Analyse des documents officiels en cours."
            message_en = "Official documents are being analyzed."
        elif build_status == "failed":
            message_fr = self._public_build_error()
            message_en = "The network analysis failed temporarily."
        else:
            message_fr = (
                "Anatole n'a pas trouvé suffisamment de relations publiques "
                "vérifiables pour cette entreprise. Cette absence ne signifie "
                "pas que l'entreprise n'a aucun fournisseur, client ou partenaire."
                if empty_ready
                else None
            )
            message_en = (
                "Anatole did not find enough publicly verifiable relationships "
                "for this company. This does not mean that the company has no "
                "suppliers, customers, or partners."
                if empty_ready
                else None
            )
        return CompanyNetworkSnapshot(
            center=center,
            nodes=ordered_nodes,
            relationships=visible_relationships,
            sector_exposure=_sector_exposure(
                ordered_nodes,
                visible_relationships,
                center.id,
            ),
            sources=sources or [],
            generated_at=_utc_now(),
            stale=stale,
            coverage=CompanyNetworkCoverage(
                depth=depth,
                truncated=truncated,
                verified_relationships=counts["verified"],
                corroborated_relationships=counts["corroborated"],
                secondary_relationships=counts["secondary"],
                official_documents_scanned=documents_scanned,
                build_status=build_status,
                retry_after_seconds=(
                    BUILD_RETRY_AFTER_SECONDS
                    if build_status == "building"
                    else None
                ),
                build_error=build_error if build_status == "failed" else None,
                message_fr=message_fr,
                message_en=message_en,
            ),
        )

    def _with_build_status(
        self,
        snapshot: CompanyNetworkSnapshot,
        status: str,
        *,
        build_error: str | None = None,
    ) -> CompanyNetworkSnapshot:
        if status == "building":
            message_fr = "Analyse des documents officiels en cours."
            message_en = "Official documents are being analyzed."
        elif status == "failed":
            message_fr = self._public_build_error()
            message_en = "The network analysis failed temporarily."
        else:
            message_fr = snapshot.coverage.message_fr
            message_en = snapshot.coverage.message_en
        coverage = snapshot.coverage.model_copy(
            update={
                "build_status": status,
                "retry_after_seconds": (
                    BUILD_RETRY_AFTER_SECONDS if status == "building" else None
                ),
                "build_error": build_error if status == "failed" else None,
                "message_fr": message_fr,
                "message_en": message_en,
            }
        )
        return snapshot.model_copy(
            update={"stale": status != "ready", "coverage": coverage}
        )

    async def _build_and_cache(
        self,
        center: CompanyNetworkNode,
        *,
        key: tuple[str, int, bool],
        refresh: bool,
    ) -> None:
        symbol, depth, include_secondary = key
        started = monotonic()
        try:
            async with self._global_build_semaphore:
                self._active_builds += 1
                logger.info(
                    "company_network_build_started ticker=%s depth=%s",
                    symbol,
                    depth,
                )
                try:
                    nodes, relationships, sources, documents_scanned = (
                        await self._build_depth_one(center, refresh=refresh)
                    )
                    if depth == 2:
                        public_neighbors = [
                            node
                            for node in nodes
                            if node.id != center.id
                            and node.public_company
                            and node.ticker
                        ][:MAX_DEPTH_TWO_COMPANIES]
                        for neighbor in public_neighbors:
                            try:
                                _, _, _, scanned = await self._build_depth_one(
                                    neighbor,
                                    refresh=refresh,
                                )
                                documents_scanned += scanned
                            except asyncio.CancelledError:
                                raise
                            except Exception as exc:  # noqa: BLE001
                                logger.warning(
                                    "company_network_depth_two_neighbor_failed "
                                    "ticker=%s neighbor=%s error_type=%s",
                                    symbol,
                                    neighbor.ticker,
                                    type(exc).__name__,
                                )
                        nodes, relationships = await self.store.graph(
                            center,
                            depth=2,
                            include_secondary=include_secondary,
                        )
                    else:
                        stored_nodes, stored_relationships = await self.store.graph(
                            center,
                            depth=1,
                            include_secondary=include_secondary,
                        )
                        if stored_relationships:
                            nodes, relationships = (
                                stored_nodes,
                                stored_relationships,
                            )
                    snapshot = self._snapshot(
                        center,
                        nodes,
                        relationships,
                        depth=depth,
                        include_secondary=include_secondary,
                        sources=sources,
                        documents_scanned=documents_scanned,
                    )
                    self._cache[key] = (monotonic(), snapshot)
                    self._build_errors.pop(key, None)
                    logger.info(
                        "company_network_build_finished ticker=%s depth=%s "
                        "duration_ms=%.1f nodes=%s relationships=%s "
                        "documents_scanned=%s",
                        symbol,
                        depth,
                        (monotonic() - started) * 1000,
                        len(snapshot.nodes),
                        len(snapshot.relationships),
                        documents_scanned,
                    )
                finally:
                    self._active_builds -= 1
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            self._build_errors[key] = self._public_build_error()
            logger.exception(
                "company_network_build_failed ticker=%s depth=%s error_type=%s",
                symbol,
                depth,
                type(exc).__name__,
            )

    def schedule_build(
        self,
        ticker: str,
        center: CompanyNetworkNode,
        *,
        depth: int,
        refresh: bool,
        include_secondary: bool,
    ) -> bool:
        key = (_normalize_ticker(ticker), depth, include_secondary)
        existing = self._build_tasks.get(key)
        if existing is not None and not existing.done():
            return False
        if not refresh and key in self._build_errors:
            return False
        if refresh:
            self._build_errors.pop(key, None)
        task = asyncio.create_task(
            self._build_and_cache(center, key=key, refresh=refresh),
            name=f"company-network:{key[0]}:depth-{depth}",
        )
        self._build_tasks[key] = task

        def remove_finished(finished: asyncio.Task[None]) -> None:
            if self._build_tasks.get(key) is finished:
                self._build_tasks.pop(key, None)

        task.add_done_callback(remove_finished)
        return True

    async def get_snapshot(
        self,
        ticker: str,
        *,
        depth: int = 1,
        refresh: bool = False,
        include_secondary: bool = True,
    ) -> CompanyNetworkSnapshot:
        symbol = _normalize_ticker(ticker)
        key = (symbol, depth, include_secondary)
        cached = self._cache.get(key)
        cache_is_fresh = self._has_fresh_cache(key)
        if cache_is_fresh and cached:
            if refresh:
                self.schedule_build(
                    symbol,
                    cached[1].center,
                    depth=depth,
                    refresh=True,
                    include_secondary=include_secondary,
                )
                return self._with_build_status(cached[1], "building")
            if key in self._build_tasks:
                return self._with_build_status(cached[1], "building")
            if key in self._build_errors:
                return self._with_build_status(
                    cached[1],
                    "failed",
                    build_error=self._build_errors[key],
                )
            return cached[1]
        center = await self.resolver.resolve(symbol)
        persisted_depth = 1 if depth == 2 else depth
        persisted_nodes, persisted_relationships = await self.store.graph(
            center,
            depth=persisted_depth,
            include_secondary=include_secondary,
        )
        if persisted_relationships:
            snapshot = self._snapshot(
                center,
                persisted_nodes,
                persisted_relationships,
                depth=depth,
                include_secondary=include_secondary,
                sources=_persisted_source_statuses(persisted_relationships),
                build_status=("building" if refresh or depth == 2 else "ready"),
                stale=refresh or depth == 2,
            )
            if not refresh and depth == 1:
                self._cache[key] = (monotonic(), snapshot)
                return snapshot
            self.schedule_build(
                symbol,
                center,
                depth=depth,
                refresh=refresh,
                include_secondary=include_secondary,
            )
            return snapshot

        if key in self._build_errors and not refresh:
            return self._snapshot(
                center,
                [center],
                [],
                depth=depth,
                include_secondary=include_secondary,
                build_status="failed",
                build_error=self._build_errors[key],
                stale=True,
            )
        self.schedule_build(
            symbol,
            center,
            depth=depth,
            refresh=refresh,
            include_secondary=include_secondary,
        )
        return self._snapshot(
            center,
            [center],
            [],
            depth=depth,
            include_secondary=include_secondary,
            build_status="building",
        )

    async def evidence(self, ticker: str, *, include_secondary: bool = True) -> CompanyNetworkEvidenceResponse:
        snapshot = await self.get_snapshot(ticker, include_secondary=include_secondary)
        return CompanyNetworkEvidenceResponse(
            ticker=snapshot.center.ticker or ticker,
            groups=[RelationshipEvidenceGroup(relationship=item, evidence=item.evidence) for item in snapshot.relationships],
            generated_at=_utc_now(),
            status=snapshot.coverage.build_status,
            retry_after_seconds=snapshot.coverage.retry_after_seconds,
            build_error=snapshot.coverage.build_error,
        )

    async def path(
        self,
        from_ticker: str,
        to_ticker: str,
        *,
        max_depth: int = 3,
        include_secondary: bool = True,
    ) -> CompanyRelationshipPath:
        source = await self.resolver.resolve(from_ticker)
        target = await self.resolver.resolve(to_ticker)
        nodes, relationships = await self.store.all_graph(include_secondary)
        node_map = {node.id: node for node in nodes}
        node_map[source.id] = source
        node_map[target.id] = target
        confidence_rank = {"verified": 0, "corroborated": 1, "secondary": 2}
        adjacency: dict[str, list[CompanyRelationship]] = {}
        for relationship in sorted(relationships, key=lambda item: confidence_rank[item.confidence]):
            adjacency.setdefault(relationship.source_node_id, []).append(relationship)
            adjacency.setdefault(relationship.target_node_id, []).append(relationship)
        queue: deque[tuple[str, list[str], list[CompanyRelationship]]] = deque([(source.id, [source.id], [])])
        visited_depth = {source.id: 0}
        while queue:
            current, node_path, edge_path = queue.popleft()
            if current == target.id:
                return CompanyRelationshipPath(
                    from_company=source,
                    to_company=target,
                    nodes=[node_map[node] for node in node_path if node in node_map],
                    relationships=edge_path,
                    depth=len(edge_path),
                    generated_at=_utc_now(),
                    found=True,
                    status="ready",
                )
            if len(edge_path) >= max_depth:
                continue
            for edge in adjacency.get(current, []):
                neighbor = edge.target_node_id if edge.source_node_id == current else edge.source_node_id
                next_depth = len(edge_path) + 1
                if visited_depth.get(neighbor, max_depth + 1) <= next_depth:
                    continue
                visited_depth[neighbor] = next_depth
                queue.append((neighbor, [*node_path, neighbor], [*edge_path, edge]))
        build_specs = [
            (source.ticker or from_ticker, source, min(2, max_depth))
        ]
        if source.id != target.id and max_depth >= 3:
            build_specs.append((target.ticker or to_ticker, target, 1))
        for build_ticker, build_center, build_depth in build_specs:
            build_key = (
                _normalize_ticker(build_ticker),
                build_depth,
                include_secondary,
            )
            if not self._has_fresh_cache(build_key):
                self.schedule_build(
                    build_ticker,
                    build_center,
                    depth=build_depth,
                    refresh=False,
                    include_secondary=include_secondary,
                )
        relevant_keys = [
            (_normalize_ticker(build_ticker), build_depth, include_secondary)
            for build_ticker, _, build_depth in build_specs
        ]
        building = any(key in self._build_tasks for key in relevant_keys)
        failed = not building and any(
            key in self._build_errors for key in relevant_keys
        )
        status = "building" if building else "failed" if failed else "ready"
        return CompanyRelationshipPath(
            from_company=source,
            to_company=target,
            depth=0,
            generated_at=_utc_now(),
            found=False,
            status=status,
            retry_after_seconds=(
                BUILD_RETRY_AFTER_SECONDS if status == "building" else None
            ),
            message_fr=(
                "Analyse du graphe en arrière-plan."
                if status == "building"
                else self._public_build_error()
                if status == "failed"
                else "Aucun lien vérifié n'a été trouvé dans les données disponibles."
            ),
            message_en=(
                "The graph is being analyzed in the background."
                if status == "building"
                else "The network analysis failed temporarily."
                if status == "failed"
                else "No verified relationship was found in the available data."
            ),
        )


company_network_service = CompanyNetworkService()
