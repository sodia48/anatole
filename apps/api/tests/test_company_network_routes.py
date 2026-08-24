from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api.routes import company_network as company_network_routes
from app.main import app
from app.schemas.company_network import (
    CompanyNetworkCoverage,
    CompanyNetworkEvidenceResponse,
    CompanyNetworkNode,
    CompanyNetworkSnapshot,
    CompanyRelationshipPath,
)


client = TestClient(app)


def public_node(ticker: str) -> CompanyNetworkNode:
    return CompanyNetworkNode(
        id=f"ticker:{ticker}",
        ticker=ticker,
        name=f"{ticker} Company",
        exchange="TSX",
        country="Canada",
        public_company=True,
        node_type="company",
    )


def test_company_network_routes_and_query_contract(monkeypatch) -> None:
    now = datetime(2026, 8, 24, tzinfo=UTC)
    source = public_node("RY")
    target = public_node("SHOP")
    calls: dict[str, object] = {}

    async def fake_snapshot(ticker: str, *, depth: int, refresh: bool, include_secondary: bool):
        calls["snapshot"] = (ticker, depth, refresh, include_secondary)
        return CompanyNetworkSnapshot(
            center=source,
            nodes=[source],
            relationships=[],
            generated_at=now,
            coverage=CompanyNetworkCoverage(depth=depth),
        )

    async def fake_evidence(ticker: str, *, include_secondary: bool):
        calls["evidence"] = (ticker, include_secondary)
        return CompanyNetworkEvidenceResponse(ticker=ticker, groups=[], generated_at=now)

    async def fake_path(from_ticker: str, to_ticker: str, *, max_depth: int, include_secondary: bool):
        calls["path"] = (from_ticker, to_ticker, max_depth, include_secondary)
        return CompanyRelationshipPath(
            from_company=source,
            to_company=target,
            nodes=[],
            relationships=[],
            depth=0,
            generated_at=now,
            found=False,
            message_fr="Aucun lien vérifié n'a été trouvé dans les données disponibles.",
            message_en="No verified relationship was found in the available data.",
        )

    monkeypatch.setattr(company_network_routes.company_network_service, "get_snapshot", fake_snapshot)
    monkeypatch.setattr(company_network_routes.company_network_service, "evidence", fake_evidence)
    monkeypatch.setattr(company_network_routes.company_network_service, "path", fake_path)

    snapshot = client.get(
        "/api/v1/discovery/company-network/RY",
        params={"depth": 2, "refresh": "true", "include_secondary": "false"},
    )
    evidence = client.get(
        "/api/v1/discovery/company-network/RY/evidence",
        params={"include_secondary": "false"},
    )
    path = client.get(
        "/api/v1/discovery/company-network/path",
        params={"from_ticker": "RY", "to_ticker": "SHOP", "max_depth": 3, "include_secondary": "false"},
    )

    assert snapshot.status_code == 200
    assert snapshot.json()["coverage"]["depth"] == 2
    assert calls["snapshot"] == ("RY", 2, True, False)
    assert evidence.status_code == 200
    assert evidence.json()["ticker"] == "RY"
    assert calls["evidence"] == ("RY", False)
    assert path.status_code == 200
    assert path.json()["found"] is False
    assert calls["path"] == ("RY", "SHOP", 3, False)


def test_company_network_routes_reject_unbounded_depth() -> None:
    snapshot = client.get("/api/v1/discovery/company-network/RY", params={"depth": 3})
    path = client.get(
        "/api/v1/discovery/company-network/path",
        params={"from_ticker": "RY", "to_ticker": "SHOP", "max_depth": 4},
    )

    assert snapshot.status_code == 422
    assert path.status_code == 422
