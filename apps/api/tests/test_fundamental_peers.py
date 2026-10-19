import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.fundamental_intelligence import PeerCandidate
from app.services.fundamental_peers import build_peer_comparison, peer_comparison
from app.services.tsx_composite_universe import CompositeConstituent
from test_fundamental_intelligence import sample_snapshot


def peer(code: str, *, cap: float = 100, currency: str = "CAD"):
    snapshot = sample_snapshot()
    snapshot.ticker = f"{code}.TO"
    snapshot.symbol = code
    snapshot.metrics.market_cap = cap
    snapshot.currency = currency
    snapshot.industry = "Industrial Machinery"
    return snapshot


def candidates(*codes: str) -> list[PeerCandidate]:
    return [PeerCandidate(ticker=code, name=code, sector="Industrials", selection_basis="Canadian index constituent; same broad sector")
            for code in codes]


def test_median_and_rank_require_five_eligible_peers() -> None:
    target = peer("TEST")
    peers = [peer(f"P{index}") for index in range(1, 6)]
    selected = [item.symbol for item in peers]
    result = build_peer_comparison(target, peers, candidates(*selected),
                                   universe_source="XIC", universe_as_of="2026-10-15", selected=selected)
    growth = next(item for item in result.measures if item.key == "revenue_growth")
    assert growth.sample_size == 6
    assert growth.median == 20
    assert growth.rank is not None
    assert all(item.source_url == "https://issuer.example/reports/2025.pdf" for item in growth.values)
    assert next(item for item in result.measures if item.key == "trailing_pe").median is None
    assert result.selected == [item.ticker for item in peers]


def test_rejects_currency_size_sector_and_missing_market_cap() -> None:
    target = peer("TEST")
    peers = [peer("USD", currency="USD"), peer("BIG", cap=1000), peer("NOCAP", cap=0), peer("BANK")]
    peers[-1].sector = "Financial Services"
    peers[-1].industry = "Banks"
    selected = [item.symbol for item in peers]
    result = build_peer_comparison(target, peers, candidates(*selected),
                                   universe_source="XIC", universe_as_of=None, selected=selected)
    assert result.selected == []
    assert len(result.excluded) == 4
    assert all(item.median is None and item.rank is None for item in result.measures)


def test_specialty_materials_do_not_auto_accept_gold_miners() -> None:
    target = peer("VNP")
    target.sector = "Basic Materials"
    target.industry = "Specialty Chemicals"
    miner = peer("GOLD")
    miner.sector = "Basic Materials"
    miner.industry = "Gold"
    chemical = peer("CHEM")
    chemical.sector = "Basic Materials"
    chemical.industry = "Specialty Chemicals"
    selected = ["GOLD", "CHEM"]
    result = build_peer_comparison(target, [miner, chemical], candidates(*selected),
                                   universe_source="XIC", universe_as_of=None, selected=selected)
    assert result.selected == ["CHEM.TO"]
    assert result.excluded["GOLD"] in {"different business family", "different industry"}
    assert result.measures[0].sample_size == 2
    assert result.measures[0].median is None
    assert result.measures[0].rank is None


def test_http_peer_selection_and_empty_comparison(monkeypatch) -> None:
    universe = [CompositeConstituent(ticker=code, name=code, sector="Industrials", weight=1, currency="CAD")
                for code in ["TEST", "P1", "P2", "P3"]]

    async def get_universe():
        return universe

    async def get_snapshot(code: str):
        return peer(code.upper().removesuffix(".TO"))

    monkeypatch.setattr("app.services.fundamental_peers.tsx_composite_universe_service.get_constituents", get_universe)
    monkeypatch.setattr("app.services.fundamental_peers.fundamentals_service.get_snapshot", get_snapshot)
    client = TestClient(app)
    response = client.get("/api/v1/stocks/TEST/fundamental-intelligence/peers?peers=P1,P2")
    assert response.status_code == 200
    data = response.json()
    assert data["selected"] == ["P1.TO", "P2.TO"]
    assert data["measures"][0]["median"] is None
    assert data["measures"][0]["sample_size"] == 3
    empty = client.get("/api/v1/stocks/TEST/fundamental-intelligence/peers?peers=")
    assert empty.status_code == 200
    assert empty.json()["selected"] == []
    invalid = client.get("/api/v1/stocks/TEST/fundamental-intelligence/peers?peers=P1,P1")
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_assistant_peer_comparison_reuses_target_snapshot(monkeypatch) -> None:
    target = peer("TEST")
    target.stale = True
    requested = []

    async def get_universe():
        return [CompositeConstituent(ticker=code, name=code, sector="Industrials", weight=1, currency="CAD")
                for code in ["TEST", "P1"]]

    async def get_snapshot(code: str):
        requested.append(code)
        assert code == "P1"
        return peer(code)

    monkeypatch.setattr("app.services.fundamental_peers.tsx_composite_universe_service.get_constituents", get_universe)
    monkeypatch.setattr("app.services.fundamental_peers.fundamentals_service.get_snapshot", get_snapshot)
    result = await peer_comparison("TEST", target_snapshot=target)
    assert result.target == "TEST.TO"
    assert requested == ["P1"]
