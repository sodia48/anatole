from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql

from app.core.config import settings
from app.schemas.company_network import (
    CompanyNetworkNode,
    CompanyNetworkSourceStatus,
    CompanyRelationship,
    RelationshipEvidence,
)
from app.schemas.fundamentals import IssuerDocumentCandidate
from app.services.accounts import AccountService
from app.services.company_network import (
    CompanyResolver,
    CompanyNetworkService,
    CompanyNetworkStore,
    FinnhubSupplyChainProvider,
    OfficialRelationshipProvider,
    ProviderResult,
    _relationship_document_candidates,
)
from app.services.company_relationship_extractor import (
    CompanyEntityIndex,
    merge_relationships,
    node_id,
    relationship_id,
)
from app.services.fundamentals import fundamentals_service
from app.services.issuer_documents import (
    issuer_financial_documents_service,
)
from app.services.tsx_composite_universe import tsx_composite_universe_service


def node(ticker: str, name: str, sector: str = "Industrials") -> CompanyNetworkNode:
    return CompanyNetworkNode(
        id=node_id(ticker, name),
        ticker=ticker,
        name=name,
        exchange="TSX",
        country="Canada",
        sector=sector,
        industry=None,
        public_company=True,
        node_type="company",
    )


def relationship(
    source: CompanyNetworkNode,
    target: CompanyNetworkNode,
    *,
    confidence: str = "verified",
    url: str = "https://issuer.example/official-report",
) -> CompanyRelationship:
    identifier = relationship_id(source.id, target.id, "supplier")
    evidence = RelationshipEvidence(
        id=node_id(None, f"{identifier}|{url}"),
        relationship_id=identifier,
        source_type="annual_report" if confidence == "verified" else "finnhub",
        title="Official report" if confidence == "verified" else "Finnhub Supply Chain",
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
        confidence=confidence,
        materiality="notable",
        source_count=1,
        last_verified_at=datetime(2026, 3, 31, tzinfo=UTC) if confidence == "verified" else None,
        evidence=[evidence],
    )


def issuer_document(
    title: str,
    document_type: str,
    published_at: datetime,
    score: float,
) -> IssuerDocumentCandidate:
    return IssuerDocumentCandidate(
        url=f"https://issuer.example/{title.lower().replace(' ', '-')}.pdf",
        title=title,
        document_format="pdf",
        document_type=document_type,
        score=score,
        origin_url="https://issuer.example/investors",
        published_at=published_at,
    )


def test_relationship_documents_prioritize_recent_annual_reports() -> None:
    documents = [
        issuer_document(
            "Q4 statements",
            "quarterly",
            datetime(2025, 12, 31, tzinfo=UTC),
            95,
        ),
        issuer_document(
            "2024 annual report",
            "annual",
            datetime(2024, 12, 31, tzinfo=UTC),
            60,
        ),
        issuer_document(
            "2025 annual report",
            "annual",
            datetime(2025, 12, 31, tzinfo=UTC),
            58,
        ),
        issuer_document(
            "Q3 statements",
            "quarterly",
            datetime(2025, 9, 30, tzinfo=UTC),
            90,
        ),
        issuer_document(
            "Q2 statements",
            "quarterly",
            datetime(2025, 6, 30, tzinfo=UTC),
            85,
        ),
    ]

    selected = _relationship_document_candidates(documents)

    assert [item.title for item in selected] == [
        "2025 annual report",
        "2024 annual report",
    ]


@pytest.mark.asyncio
async def test_official_relationships_discover_without_parsing_financials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    center = node("MDA", "MDA Space Ltd.")
    candidate = issuer_document(
        "2025 annual report",
        "annual",
        datetime(2025, 12, 31, tzinfo=UTC),
        58,
    )

    async def snapshot(_ticker: str):
        return type(
            "Fundamentals",
            (),
            {"website": "https://mda.space"},
        )()

    async def discover(_ticker: str, _website: str):
        return (
            "https://mda-en.investorroom.com/",
            [candidate],
            None,
        )

    async def financials(*_args, **_kwargs):
        raise AssertionError(
            "Relationship discovery must not parse financial statements."
        )

    provider = OfficialRelationshipProvider()

    async def extract(_center, _index, _candidate):
        return [], []

    monkeypatch.setattr(
        fundamentals_service,
        "get_snapshot",
        snapshot,
    )
    monkeypatch.setattr(
        issuer_financial_documents_service,
        "discover",
        discover,
    )
    monkeypatch.setattr(
        issuer_financial_documents_service,
        "get_financials",
        financials,
    )
    monkeypatch.setattr(provider, "_issuer_document", extract)

    result = await provider.issuer_documents(
        center,
        CompanyEntityIndex([center]),
        refresh=True,
    )

    assert result.documents_scanned == 1
    assert result.status.status == "available"


class Resolver:
    def __init__(self, nodes: list[CompanyNetworkNode]) -> None:
        self.nodes = {item.ticker: item for item in nodes}

    async def resolve(self, ticker: str) -> CompanyNetworkNode:
        return self.nodes[ticker.upper()]

    async def index(self, center: CompanyNetworkNode) -> CompanyEntityIndex:
        return CompanyEntityIndex(self.nodes.values())


async def store_for(tmp_path, name: str) -> tuple[CompanyNetworkStore, AccountService]:
    account = AccountService(f"sqlite:///{tmp_path / f'{name}.db'}")
    store = CompanyNetworkStore()
    store.account_service = account
    await store.start()
    return store, account


@pytest.mark.asyncio
async def test_persistence_depth_deduplication_and_evidence_association(tmp_path) -> None:
    a, b, c = node("A", "Alpha Corp"), node("B", "Beta Corp", "Technology"), node("C", "Gamma Corp")
    ab, bc = relationship(a, b), relationship(b, c)
    store, account = await store_for(tmp_path, "depth")
    try:
        await store.save([a, b, c], [ab, bc])
        await store.save([a, b, c], [ab])
        depth_one_nodes, depth_one_relationships = await store.graph(a, depth=1, include_secondary=True)
        depth_two_nodes, depth_two_relationships = await store.graph(a, depth=2, include_secondary=True)
        assert {item.ticker for item in depth_one_nodes} == {"A", "B"}
        assert [item.id for item in depth_one_relationships] == [ab.id]
        assert {item.ticker for item in depth_two_nodes} == {"A", "B", "C"}
        assert {item.id for item in depth_two_relationships} == {ab.id, bc.id}
        assert depth_one_relationships[0].evidence[0].relationship_id == ab.id
    finally:
        await account.close()


def test_tables_compile_for_postgresql_without_user_domain_columns() -> None:
    store = CompanyNetworkStore()
    for table in (store.entities, store.relationships, store.evidence):
        sql = str(CreateTable(table).compile(dialect=postgresql.dialect()))
        assert "CREATE TABLE company_network_" in sql
        assert "user_id" not in sql


@pytest.mark.asyncio
async def test_resolver_reuses_precompiled_base_index(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    async def constituents():
        nonlocal calls
        calls += 1
        return []

    monkeypatch.setattr(
        tsx_composite_universe_service,
        "get_constituents",
        constituents,
    )
    resolver = CompanyResolver()
    center = await resolver.resolve("RY")

    first = await resolver.index(center)
    second = await resolver.index(center)

    assert calls == 1
    assert first is not second
    assert first._compiled_aliases is second._compiled_aliases


def test_corroboration_requires_two_distinct_credible_sources() -> None:
    a, b = node("A", "Alpha Corp"), node("B", "Beta Corp")
    first = relationship(a, b, confidence="secondary", url="https://source-one.example/relation")
    second = relationship(a, b, confidence="secondary", url="https://source-two.example/relation")
    merged = merge_relationships([first, second])[0]
    assert merged.confidence == "corroborated"
    assert merged.source_count == 2


@pytest.mark.asyncio
async def test_paths_depth_one_two_three_no_path_and_confidence_filter(tmp_path) -> None:
    a, b, c, d, e = [node(symbol, f"{symbol} Company") for symbol in "ABCDE"]
    ab = relationship(a, b)
    bc = relationship(b, c)
    cd = relationship(c, d, confidence="secondary", url="https://finnhub.io/docs/api/supply-chain")
    store, account = await store_for(tmp_path, "paths")

    class NoopOfficialProvider:
        async def issuer_documents(self, center, index, *, refresh):
            return ProviderResult([], [], CompanyNetworkSourceStatus(source="Documents officiels", status="unavailable", detail="No fixture document."))

        async def sec_documents(self, center, index):
            return ProviderResult([], [], CompanyNetworkSourceStatus(source="SEC", status="unavailable", detail="No fixture filing."))

    service = CompanyNetworkService(
        resolver=Resolver([a, b, c, d, e]),
        store=store,
        official_provider=NoopOfficialProvider(),
    )
    try:
        await store.save([a, b, c, d, e], [ab, bc, cd])
        assert (await service.path("A", "B", max_depth=3)).depth == 1
        assert (await service.path("A", "C", max_depth=3)).depth == 2
        assert (await service.path("A", "D", max_depth=3, include_secondary=True)).depth == 3
        filtered = await service.path("A", "D", max_depth=3, include_secondary=False)
        assert filtered.found is False
        assert filtered.status == "building"
        assert "arrière-plan" in (filtered.message_fr or "")
        no_path = await service.path("A", "E", max_depth=3)
        assert no_path.found is False
        assert no_path.status == "building"
    finally:
        await service.close()
        await account.close()


@pytest.mark.asyncio
async def test_snapshot_hard_limits_nodes_and_depth(tmp_path) -> None:
    center = node("ROOT", "Root Company")
    neighbors = [node(f"N{index}", f"Neighbor {index}", "Technology") for index in range(45)]
    relationships = [relationship(center, item, url=f"https://issuer.example/{index}") for index, item in enumerate(neighbors)]
    store, account = await store_for(tmp_path, "limits")
    service = CompanyNetworkService(resolver=Resolver([center, *neighbors]), store=store)
    try:
        await store.save([center, *neighbors], relationships)
        snapshot = await service.get_snapshot("ROOT", depth=1)
        assert len(snapshot.nodes) <= 40
        assert snapshot.coverage.depth == 1
        assert snapshot.coverage.truncated is True
        assert {item.source for item in snapshot.sources} == {
            "Documents officiels", "Finnhub Supply Chain", "SEC", "SEDAR+/IR"
        }
    finally:
        await account.close()


class OfficialProvider:
    def __init__(self, nodes: list[CompanyNetworkNode], relationships: list[CompanyRelationship]) -> None:
        self.nodes = nodes
        self.relationships = relationships

    async def issuer_documents(self, center, index, *, refresh):
        return ProviderResult(
            self.nodes,
            self.relationships,
            CompanyNetworkSourceStatus(source="Documents officiels", status="available", count=len(self.relationships), detail="Official evidence loaded."),
            documents_scanned=1,
        )

    async def sec_documents(self, center, index):
        return ProviderResult([], [], CompanyNetworkSourceStatus(source="SEC", status="unavailable", detail="No SEC filer."))


@pytest.mark.asyncio
async def test_finnhub_failure_does_not_hide_official_relationships(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "")
    a, b = node("A", "Alpha Corp"), node("B", "Beta Corp")
    official = relationship(a, b)
    store, account = await store_for(tmp_path, "fallback")
    service = CompanyNetworkService(
        resolver=Resolver([a, b]),
        store=store,
        official_provider=OfficialProvider([b], [official]),
        finnhub_provider=FinnhubSupplyChainProvider(),
    )
    try:
        initial = await service.get_snapshot("A", refresh=True)
        assert initial.coverage.build_status == "building"
        await asyncio.gather(*list(service._build_tasks.values()))
        await asyncio.sleep(0)
        snapshot = await service.get_snapshot("A")
        assert snapshot.relationships == [official]
        finnhub = next(item for item in snapshot.sources if item.source == "Finnhub Supply Chain")
        assert finnhub.status == "unavailable"
        assert snapshot.coverage.verified_relationships == 1
    finally:
        await service.close()
        await account.close()
