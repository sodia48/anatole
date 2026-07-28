from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.etf_history import EtfHistorySnapshot
from app.schemas.etf_holdings import EtfHoldingsSnapshot
from app.schemas.ipo_insiders import (
    InsiderSnapshot,
    InsiderSummary,
    IpoSnapshot,
    IpoSummary,
)
from app.services.etf_history import etf_history_service
from app.services.etf_holdings import etf_holdings_service
from app.services.insiders import insider_service
from app.services.ipo import ipo_service


def test_operational_routes_are_registered(monkeypatch) -> None:
    async def fake_holdings(*args, **kwargs):
        return EtfHoldingsSnapshot(
            ticker="XIC",
            normalized_symbol="XIC.TO",
            name="iShares Core S&P/TSX Capped Composite Index ETF",
            provider="iShares",
            category="Marché canadien",
            exposure="Actions canadiennes",
            status="partial",
            message="Test",
            source_name="Test",
            generated_at=datetime.now(UTC),
        )

    async def fake_history(*args, **kwargs):
        return EtfHistorySnapshot(
            ticker="XIC",
            normalized_symbol="XIC.TO",
            range="1mo",
            range_label="1 mois",
            interval="1d",
            points=[],
            status="unavailable",
            message="Test",
            source_name="Test",
            generated_at=datetime.now(UTC),
            refresh_after_seconds=300,
        )

    async def fake_ipo(*args, **kwargs):
        return IpoSnapshot(
            items=[],
            summary=IpoSummary(
                total=0,
                canada=0,
                united_states=0,
                companies=0,
                newly_listed=0,
                regulatory_filings=0,
            ),
            sources=[],
            generated_at=datetime.now(UTC),
            message="Test",
        )

    async def fake_insiders(*args, **kwargs):
        return InsiderSnapshot(
            trades=[],
            summary=InsiderSummary(
                transactions=0,
                companies=0,
                buys=0,
                sells=0,
                grants_and_exercises=0,
                buy_ratio_percent=0,
                unusual_transactions=0,
            ),
            sources=[],
            market="Canada",
            requested_ticker=None,
            scanned_symbols=0,
            generated_at=datetime.now(UTC),
            message="Test",
        )

    monkeypatch.setattr(etf_holdings_service, "snapshot", fake_holdings)
    monkeypatch.setattr(etf_history_service, "snapshot", fake_history)
    monkeypatch.setattr(ipo_service, "snapshot", fake_ipo)
    monkeypatch.setattr(insider_service, "snapshot", fake_insiders)

    with TestClient(app) as client:
        assert client.get(
            "/api/v1/discovery/etfs/XIC/holdings?limit=5"
        ).status_code == 200
        assert client.get(
            "/api/v1/discovery/etfs/XIC/history?range=1mo"
        ).status_code == 200
        assert client.get(
            "/api/v1/discovery/ipo?limit=5"
        ).status_code == 200
        assert client.get(
            "/api/v1/discovery/insiders?market=canada&days=30&scan_limit=2&limit=5"
        ).status_code == 200
