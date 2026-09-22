from __future__ import annotations

import pytest

from app.services.tmx_money import (
    TMXMoneyService,
    _tmx_symbol,
    company_to_summary,
)


def test_tmx_symbol_matches_tmx_class_share_notation() -> None:
    assert _tmx_symbol("RY.TO") == "RY"
    assert _tmx_symbol("RCI-B.TO") == "RCI.B"
    assert _tmx_symbol("XYZ.V") == "XYZ"


def test_company_to_summary_maps_market_valuation_and_dividend_fields() -> None:
    summary = company_to_summary(
        {
            "name": "Royal Bank of Canada",
            "currency": "CAD",
            "exchangeCode": "TSX",
            "sector": "Finance",
            "industry": "Banking",
            "price": 284.45,
            "MarketCap": 394_418_219_242,
            "peRatio": 17.54,
            "eps": 15.9,
            "beta": 0.930458,
            "weeks52high": 306.38,
            "weeks52low": 200.78,
            "averageVolume10D": 2_630_158,
            "shareOutStanding": 1_386_599_470,
            "dividendAmount": 1.76,
            "dividendYield": 2.475,
            "dividendFrequency": "Quarterly",
            "priceToBook": 2.94,
        }
    )

    assert summary["_source"] == "TMX Money"
    assert summary["price"]["marketCap"] == 394_418_219_242
    assert summary["summaryDetail"]["dividendRate"] == pytest.approx(7.04)
    assert summary["summaryDetail"]["dividendYield"] == pytest.approx(0.02475)
    assert summary["summaryDetail"]["payoutRatio"] == pytest.approx(7.04 / 15.9)
    assert summary["summaryDetail"].get("averageVolume") is None
    assert summary["defaultKeyStatistics"]["sharesOutstanding"] == 1_386_599_470


@pytest.mark.asyncio
async def test_tmx_service_uses_graphql_variables_and_rejects_non_canadian_listing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = TMXMoneyService()

    class Response:
        def json(self):
            return {
                "data": {
                    "getQuoteBySymbol": {
                        "symbol": "RCI.B",
                        "exchangeCode": "NYSE",
                    }
                }
            }

    async def request(method, url, **kwargs):
        assert method == "POST"
        assert kwargs["json"]["variables"] == {
            "symbol": "RCI.B",
            "locale": "en",
        }
        return Response()

    monkeypatch.setattr(
        "app.services.tmx_money.shared_http_client.request",
        request,
    )

    with pytest.raises(RuntimeError, match="Canadian listing"):
        await service._load_company("RCI-B.TO")
