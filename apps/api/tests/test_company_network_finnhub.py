import httpx
import pytest

from app.core.config import settings
from app.schemas.company_network import CompanyNetworkNode
from app.services.company_network import FinnhubSupplyChainProvider
from app.services.company_relationship_extractor import node_id


def center() -> CompanyNetworkNode:
    return CompanyNetworkNode(
        id=node_id("MDA", "MDA Space Ltd."),
        ticker="MDA",
        name="MDA Space Ltd.",
        exchange="TSX",
        country="Canada",
        sector="Industrials",
        industry="Aerospace",
        public_company=True,
        node_type="company",
    )


@pytest.mark.asyncio
async def test_finnhub_customer_and_supplier_directions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["symbol"] == "MDA"
        return httpx.Response(200, json={"data": [
            {"name": "Globalstar, Inc.", "symbol": "GSAT", "customer": True, "supplier": False},
            {"name": "Northstar Components", "symbol": "", "customer": False, "supplier": True},
            {"name": "Dual Role Corp", "symbol": "DUAL", "customer": True, "supplier": True},
        ]})

    result = await FinnhubSupplyChainProvider(httpx.MockTransport(handler)).load(center())
    by_name = {node.name: node for node in result.nodes}
    relationships = {(item.relationship_type, item.source_node_id, item.target_node_id) for item in result.relationships}
    assert ("customer", center().id, by_name["Globalstar, Inc."].id) in relationships
    assert ("supplier", by_name["Northstar Components"].id, center().id) in relationships
    assert ("customer", center().id, by_name["Dual Role Corp"].id) in relationships
    assert ("supplier", by_name["Dual Role Corp"].id, center().id) in relationships
    assert by_name["Northstar Components"].ticker is None
    assert all(item.confidence == "secondary" for item in result.relationships)


@pytest.mark.asyncio
async def test_finnhub_premium_403_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    provider = FinnhubSupplyChainProvider(httpx.MockTransport(lambda _: httpx.Response(403, json={"error": "premium_required"})))
    result = await provider.load(center())
    assert result.status.status == "unavailable"
    assert "premium" in result.status.detail
    assert result.relationships == []


@pytest.mark.asyncio
async def test_finnhub_timeout_isolated_from_other_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    result = await FinnhubSupplyChainProvider(httpx.MockTransport(timeout)).load(center())
    assert result.status.status == "unavailable"
    assert "Délai" in result.status.detail
