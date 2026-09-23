from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.schemas.workspace import PortfolioPositionInput
from app.services.currency_conversion import currency_conversion_service
from app.services.portfolio import PortfolioService
from app.services.portfolio_symbols import portfolio_provider_ticker
from app.services.session_quotes import session_quote_service


def test_portfolio_market_routing_keeps_canada_and_supports_foreign() -> None:
    ca = PortfolioPositionInput(symbol="RY", quantity=1, average_cost=100)
    us = PortfolioPositionInput(symbol="AAPL", quantity=1, average_cost=200, market="US")
    intl = PortfolioPositionInput(symbol="BMW.DE", quantity=1, average_cost=80, market="INTL")
    assert portfolio_provider_ticker(ca.symbol, ca.market) == "RY"
    assert portfolio_provider_ticker(us.symbol, us.market) == "US:AAPL"
    assert portfolio_provider_ticker(intl.symbol, intl.market) == "INTL:BMW.DE"
    assert session_quote_service.normalize_ticker("RY") == "RY.TO"
    assert session_quote_service.normalize_ticker("US:AAPL") == "AAPL"
    assert session_quote_service.normalize_ticker("INTL:BMW.DE") == "BMW.DE"


@pytest.mark.asyncio
async def test_portfolio_fx_rates_support_multiple_foreign_currencies(monkeypatch: pytest.MonkeyPatch) -> None:
    rates = {"CAD": 1.0, "USD": 1.35, "EUR": 1.58, "JPY": 0.0092}
    async def rate_to_cad(currency: str) -> float | None:
        return rates.get(currency)
    monkeypatch.setattr(currency_conversion_service, "rate_to_cad", AsyncMock(side_effect=rate_to_cad))
    converted, notes = await PortfolioService()._fx_rates({"CAD", "USD", "EUR", "JPY"}, "CAD")
    assert converted["CAD"] == pytest.approx(1.0)
    assert converted["USD"] == pytest.approx(1.35)
    assert converted["EUR"] == pytest.approx(1.58)
    assert converted["JPY"] == pytest.approx(0.0092)
    assert notes == []
