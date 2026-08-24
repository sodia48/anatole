from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from time import monotonic

import httpx
import pytest

from app.api.routes import company_network as company_network_routes
from app.main import app
from app.schemas.company_network import (
    CompanyNetworkNode,
    CompanyNetworkSourceStatus,
    CompanyRelationship,
    RelationshipEvidence,
)
from app.schemas.fundamentals import IssuerDocumentCandidate
from app.services.company_network import (
    CompanyNetworkService,
    OfficialRelationshipProvider,
    ProviderResult,
)
from app.services.company_relationship_extractor import (
    CompanyEntityIndex,
    node_id,
    relationship_id,
)
from app.services.issuer_document_parser import financial_document_parser
from app.services.company_relationship_extractor import company_relationship_extractor


def company(ticker: str, name: str) -> CompanyNetworkNode:
    return CompanyNetworkNode(
        id=node_id(ticker, name),
        ticker=ticker,
        name=name,
        exchange="TSX",
        country="Canada",
        sector="Industrials",
        industry=None,
        public_company=True,
        node_type="company",
    )


def edge(
    source: CompanyNetworkNode,
    target: CompanyNetworkNode,
    *,
    url: str = "https://issuer.example/official-report",
) -> CompanyRelationship:
    identifier = relationship_id(source.id, target.id, "supplier")
    evidence = RelationshipEvidence(
        id=node_id(None, f"{identifier}|{url}"),
        relationship_id=identifier,
        source_type="annual_report",
        title="Official report",
        url=url,
        published_at=datetime(2026, 3, 31, tzinfo=UTC),
        document_date=datetime(2026, 3, 31, tzinfo=UTC),
        excerpt=f"{source.name} is a supplier of {target.name}.",
        issuer=target.name,
    )
    return CompanyRelationship(
        id=identifier,
        source_node_id=source.id,
        target_node_id=target.id,
        relationship_type="supplier",
        status="active",
        confidence="verified",
        materiality="notable",
        source_count=1,
        last_verified_at=datetime(2026, 3, 31, tzinfo=UTC),
        evidence=[evidence],
    )


class Resolver:
    def __init__(self, nodes: list[CompanyNetworkNode]) -> None:
        self.nodes = {item.ticker: item for item in nodes}

    async def resolve(self, ticker: str) -> CompanyNetworkNode:
        return self.nodes[ticker.upper()]

    async def index(self, center: CompanyNetworkNode) -> CompanyEntityIndex:
        return CompanyEntityIndex(self.nodes.values())


class MemoryStore:
    def __init__(
        self,
        nodes: list[CompanyNetworkNode] | None = None,
        relationships: list[CompanyRelationship] | None = None,
    ) -> None:
        self.nodes = {item.id: item for item in nodes or []}
        self.relationships = {item.id: item for item in relationships or []}

    async def start(self) -> None:
        return None

    async def save(self, nodes, relationships) -> None:
        self.nodes.update({item.id: item for item in nodes})
        self.relationships.update({item.id: item for item in relationships})

    async def graph(self, center, *, depth: int, include_secondary: bool):
        self.nodes[center.id] = center
        relationships = [
            item
            for item in self.relationships.values()
            if include_secondary or item.confidence != "secondary"
        ]
        visited = {center.id}
        frontier = {center.id}
        for _ in range(depth):
            next_frontier: set[str] = set()
            for item in relationships:
                if item.source_node_id in frontier:
                    next_frontier.add(item.target_node_id)
                if item.target_node_id in frontier:
                    next_frontier.add(item.source_node_id)
            next_frontier -= visited
            visited.update(next_frontier)
            frontier = next_frontier
        visible_edges = [
            item
            for item in relationships
            if item.source_node_id in visited and item.target_node_id in visited
        ]
        return [self.nodes[item] for item in visited if item in self.nodes], visible_edges

    async def all_graph(self, include_secondary: bool):
        relationships = [
            item
            for item in self.relationships.values()
            if include_secondary or item.confidence != "secondary"
        ]
        return list(self.nodes.values()), relationships


class NoopFinnhub:
    async def load(self, center, *, refresh: bool):
        return ProviderResult(
            [],
            [],
            CompanyNetworkSourceStatus(
                source="Finnhub Supply Chain",
                status="unavailable",
                detail="Not configured in this test.",
            ),
        )


class GatedOfficialProvider:
    def __init__(
        self,
        results: dict[str, tuple[list[CompanyNetworkNode], list[CompanyRelationship]]],
        *,
        released: bool = False,
        fail: bool = False,
        delay_seconds: float = 0,
    ) -> None:
        self.results = results
        self.release = asyncio.Event()
        if released:
            self.release.set()
        self.started = asyncio.Event()
        self.calls = 0
        self.fail = fail
        self.delay_seconds = delay_seconds
        self.active = 0
        self.max_active = 0

    async def issuer_documents(self, center, index, *, refresh):
        self.calls += 1
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.started.set()
        try:
            await self.release.wait()
            if self.delay_seconds:
                await asyncio.sleep(self.delay_seconds)
            if self.fail:
                raise RuntimeError("secret-provider-url-and-key")
            nodes, relationships = self.results.get(center.ticker or "", ([], []))
            return ProviderResult(
                nodes,
                relationships,
                CompanyNetworkSourceStatus(
                    source="Documents officiels",
                    status="available" if relationships else "partial",
                    count=len(relationships),
                    detail="Official fixture analyzed.",
                ),
                documents_scanned=1,
            )
        finally:
            self.active -= 1

    async def sec_documents(self, center, index):
        return ProviderResult(
            [],
            [],
            CompanyNetworkSourceStatus(
                source="SEC",
                status="unavailable",
                detail="No SEC fixture.",
            ),
        )


async def wait_for_idle(service: CompanyNetworkService) -> None:
    while service._build_tasks:
        await asyncio.gather(
            *list(service._build_tasks.values()),
            return_exceptions=True,
        )
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_first_route_is_fast_and_ten_requests_deduplicate_build(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    center = company("RY", "Royal Bank of Canada")
    supplier = company("POW", "Power Corporation of Canada")
    relationship = edge(supplier, center)
    provider = GatedOfficialProvider({"RY": ([supplier], [relationship])})
    service = CompanyNetworkService(
        resolver=Resolver([center, supplier]),
        store=MemoryStore(),
        official_provider=provider,
        finnhub_provider=NoopFinnhub(),
    )
    monkeypatch.setattr(company_network_routes, "company_network_service", service)
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            started = monotonic()
            responses = await asyncio.gather(*[
                client.get(
                    "/api/v1/discovery/company-network/RY",
                    params={"include_secondary": str(index % 2 == 0).lower()},
                )
                for index in range(10)
            ])
            elapsed = monotonic() - started
            assert elapsed < 0.75
            assert all(response.status_code == 200 for response in responses)
            assert all(
                response.json()["coverage"]["build_status"] == "building"
                for response in responses
            )
            evidence = await client.get(
                "/api/v1/discovery/company-network/RY/evidence"
            )
            assert evidence.status_code == 200
            assert evidence.json()["status"] == "building"
            assert evidence.json()["groups"] == []
            await asyncio.wait_for(provider.started.wait(), timeout=1)
            assert provider.calls == 1

            provider.release.set()
            await wait_for_idle(service)
            ready = await client.get("/api/v1/discovery/company-network/RY")
            ready_without_secondary = await client.get(
                "/api/v1/discovery/company-network/RY",
                params={"include_secondary": "false"},
            )
            assert ready.json()["coverage"]["build_status"] == "ready"
            assert ready_without_secondary.json()["coverage"]["build_status"] == "ready"
            assert len(ready.json()["relationships"]) == 1
            assert provider.calls == 1
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_global_build_concurrency_is_one() -> None:
    first = company("A", "Alpha Corp")
    second = company("B", "Beta Corp")
    provider = GatedOfficialProvider(
        {},
        released=True,
        delay_seconds=0.05,
    )
    service = CompanyNetworkService(
        resolver=Resolver([first, second]),
        store=MemoryStore(),
        official_provider=provider,
        finnhub_provider=NoopFinnhub(),
    )
    try:
        await asyncio.gather(
            service.get_snapshot("A"),
            service.get_snapshot("B"),
        )
        assert service.readiness()["queued_or_running"] == 2
        await wait_for_idle(service)
        assert provider.calls == 2
        assert provider.max_active == 1
    finally:
        await service.close()


class CpuSlowOfficialProvider(OfficialRelationshipProvider):
    def __init__(self, supplier: CompanyNetworkNode) -> None:
        super().__init__()
        self.supplier = supplier
        self.started = asyncio.Event()

    async def issuer_documents(self, center, index, *, refresh):
        candidate = IssuerDocumentCandidate(
            url="https://issuer.example/annual-report.html",
            title="Official annual report",
            document_format="html",
            document_type="annual",
            score=100,
            origin_url="https://issuer.example/investors",
            published_at=datetime(2026, 3, 31, tzinfo=UTC),
        )
        self.started.set()
        extracted = await self._extract_document(
            center,
            index,
            b"official document",
            candidate,
            "annual_report",
        )
        nodes, relationships = extracted or ([], [])
        return ProviderResult(
            nodes,
            relationships,
            CompanyNetworkSourceStatus(
                source="Documents officiels",
                status="available",
                count=len(relationships),
                detail="Slow CPU fixture analyzed.",
            ),
            documents_scanned=1,
        )

    async def sec_documents(self, center, index):
        return ProviderResult(
            [],
            [],
            CompanyNetworkSourceStatus(
                source="SEC",
                status="unavailable",
                detail="No SEC fixture.",
            ),
        )


@pytest.mark.asyncio
async def test_health_stays_responsive_during_slow_cpu_extraction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    center = company("MDA", "MDA Space Ltd.")
    supplier = company("GSAT", "Globalstar, Inc.")
    relationship = edge(supplier, center)
    provider = CpuSlowOfficialProvider(supplier)
    service = CompanyNetworkService(
        resolver=Resolver([center, supplier]),
        store=MemoryStore(),
        official_provider=provider,
        finnhub_provider=NoopFinnhub(),
    )

    def fake_parse(content, candidate, *, max_pdf_pages=None):
        return "Globalstar, Inc. is our supplier."

    def slow_extract(current, document, index):
        time.sleep(1.2)
        return [supplier], [relationship]

    monkeypatch.setattr(financial_document_parser, "extract_text", fake_parse)
    monkeypatch.setattr(company_relationship_extractor, "extract", slow_extract)
    monkeypatch.setattr(company_network_routes, "company_network_service", service)
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            initial = await client.get("/api/v1/discovery/company-network/MDA")
            assert initial.json()["coverage"]["build_status"] == "building"
            await asyncio.wait_for(provider.started.wait(), timeout=1)

            started = monotonic()
            health = await client.get("/health")
            health_elapsed = monotonic() - started

            assert health.status_code == 200
            assert health.json()["status"] == "ok"
            assert health_elapsed < 0.75
            assert service.readiness()["active_builds"] == 1
            await wait_for_idle(service)
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_refresh_returns_old_snapshot_and_failure_preserves_it() -> None:
    center = company("SHOP", "Shopify Inc.")
    old_supplier = company("AMZN", "Amazon.com, Inc.")
    old_relationship = edge(
        old_supplier,
        center,
        url="https://issuer.example/old-report",
    )
    provider = GatedOfficialProvider({}, fail=True)
    service = CompanyNetworkService(
        resolver=Resolver([center, old_supplier]),
        store=MemoryStore([center, old_supplier], [old_relationship]),
        official_provider=provider,
        finnhub_provider=NoopFinnhub(),
    )
    try:
        cached = await service.get_snapshot("SHOP")
        assert cached.coverage.build_status == "ready"

        started = monotonic()
        refreshing = await service.get_snapshot("SHOP", refresh=True)
        assert monotonic() - started < 0.25
        assert refreshing.coverage.build_status == "building"
        assert refreshing.stale is True
        assert refreshing.relationships == [old_relationship]

        provider.release.set()
        await wait_for_idle(service)
        failed = await service.get_snapshot("SHOP")
        assert failed.coverage.build_status == "failed"
        assert failed.relationships == [old_relationship]
        assert failed.coverage.build_error == "L'analyse du réseau a échoué temporairement."
        assert "secret" not in (failed.coverage.build_error or "")
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_successful_refresh_replaces_cache_only_after_build() -> None:
    center = company("SHOP", "Shopify Inc.")
    supplier = company("AMZN", "Amazon.com, Inc.")
    old_relationship = edge(
        supplier,
        center,
        url="https://issuer.example/old-report",
    )
    new_relationship = edge(
        supplier,
        center,
        url="https://issuer.example/new-report",
    )
    provider = GatedOfficialProvider({
        "SHOP": ([supplier], [new_relationship]),
    })
    service = CompanyNetworkService(
        resolver=Resolver([center, supplier]),
        store=MemoryStore([center, supplier], [old_relationship]),
        official_provider=provider,
        finnhub_provider=NoopFinnhub(),
    )
    try:
        old_snapshot = await service.get_snapshot("SHOP")
        refreshing = await service.get_snapshot("SHOP", refresh=True)
        assert refreshing.relationships == old_snapshot.relationships
        assert str(refreshing.relationships[0].evidence[0].url).endswith(
            "/old-report"
        )

        provider.release.set()
        await wait_for_idle(service)
        refreshed = await service.get_snapshot("SHOP")
        assert refreshed.coverage.build_status == "ready"
        assert str(refreshed.relationships[0].evidence[0].url).endswith(
            "/new-report"
        )
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_depth_two_returns_depth_one_then_expands_sequentially() -> None:
    center = company("A", "Alpha Corp")
    neighbor = company("B", "Beta Corp")
    second = company("C", "Gamma Corp")
    first_edge = edge(neighbor, center, url="https://issuer.example/a-b")
    second_edge = edge(second, neighbor, url="https://issuer.example/b-c")
    provider = GatedOfficialProvider({
        "A": ([neighbor], [first_edge]),
        "B": ([second], [second_edge]),
    })
    service = CompanyNetworkService(
        resolver=Resolver([center, neighbor, second]),
        store=MemoryStore([center, neighbor], [first_edge]),
        official_provider=provider,
        finnhub_provider=NoopFinnhub(),
    )
    try:
        started = monotonic()
        initial = await service.get_snapshot("A", depth=2)
        assert monotonic() - started < 0.25
        assert initial.coverage.depth == 2
        assert initial.coverage.build_status == "building"
        assert initial.relationships == [first_edge]

        await asyncio.wait_for(provider.started.wait(), timeout=1)
        assert provider.calls == 1
        provider.release.set()
        await wait_for_idle(service)
        ready = await service.get_snapshot("A", depth=2)
        assert ready.coverage.build_status == "ready"
        assert {item.id for item in ready.relationships} == {
            first_edge.id,
            second_edge.id,
        }
        assert provider.calls == 2
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_zero_relationship_result_and_path_are_cached_for_24_hours() -> None:
    source = company("A", "Alpha Corp")
    target = company("B", "Beta Corp")
    provider = GatedOfficialProvider({}, released=True)
    service = CompanyNetworkService(
        resolver=Resolver([source, target]),
        store=MemoryStore(),
        official_provider=provider,
        finnhub_provider=NoopFinnhub(),
    )
    try:
        initial = await service.get_snapshot("A")
        assert initial.coverage.build_status == "building"
        await wait_for_idle(service)
        ready = await service.get_snapshot("A")
        repeated = await service.get_snapshot("A")
        assert ready.coverage.build_status == "ready"
        assert ready.relationships == []
        assert repeated.coverage.build_status == "ready"
        assert provider.calls == 1

        path = await service.path("A", "B")
        assert path.status == "building"
        await wait_for_idle(service)
        ready_path = await service.path("A", "B")
        repeated_path = await service.path("A", "B")
        assert ready_path.status == "ready"
        assert repeated_path.status == "ready"
        assert ready_path.found is False
        assert provider.calls == 3
    finally:
        await service.close()
