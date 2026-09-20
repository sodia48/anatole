from __future__ import annotations

import math
from typing import Any

from app.core.data_hub import shared_data_hub
from app.core.resilience import shared_http_client

TMX_MONEY_GRAPHQL_URL = "https://app-money.tmx.com/graphql"

_COMPANY_QUERY = """
query getQuoteBySymbol($symbol: String, $locale: String) {
  getQuoteBySymbol(symbol: $symbol, locale: $locale) {
    symbol
    name
    currency
    exchangeName
    exchangeCode
    sector
    industry
    price
    MarketCap
    peRatio
    eps
    beta
    weeks52high
    weeks52low
    averageVolume10D
    averageVolume30D
    shareOutStanding
    totalSharesOutStanding
    dividendAmount
    dividendYield
    dividendFrequency
    exDividendDate
    dividendPayDate
    priceToBook
    priceToCashFlow
    returnOnEquity
    returnOnAssets
    totalDebtToEquity
    website
  }
}
"""

_DIVIDEND_PERIODS_PER_YEAR = {
    "annual": 1,
    "annually": 1,
    "semi-annual": 2,
    "semi-annually": 2,
    "semiannual": 2,
    "quarterly": 4,
    "monthly": 12,
}


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _tmx_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper()
    for suffix in (".TO", ".V"):
        if normalized.endswith(suffix):
            normalized = normalized[: -len(suffix)]
            break
    # Yahoo uses RCI-B.TO while TMX Money uses RCI.B.
    return normalized.replace("-", ".")


def _annual_dividend(company: dict[str, Any]) -> float | None:
    amount = _number(company.get("dividendAmount"))
    frequency = str(company.get("dividendFrequency") or "").strip().casefold()
    periods = _DIVIDEND_PERIODS_PER_YEAR.get(frequency)
    if amount is None or periods is None:
        return None
    return amount * periods


def company_to_summary(company: dict[str, Any]) -> dict[str, Any]:
    """Translate verified TMX fields into the existing Yahoo-shaped mapper."""
    annual_dividend = _annual_dividend(company)
    eps = _number(company.get("eps"))
    payout_ratio = (
        annual_dividend / eps
        if annual_dividend is not None and eps is not None and eps > 0
        else None
    )
    dividend_yield = _number(company.get("dividendYield"))
    return {
        "_source": "TMX Money",
        "assetProfile": {
            "sector": company.get("sector"),
            "industry": company.get("industry"),
            "website": company.get("website"),
        },
        "price": {
            "longName": company.get("name"),
            "currency": company.get("currency"),
            "exchangeName": company.get("exchangeName") or company.get("exchangeCode"),
            "marketCap": company.get("MarketCap"),
        },
        "summaryDetail": {
            "trailingPE": company.get("peRatio"),
            "fiftyTwoWeekHigh": company.get("weeks52high"),
            "fiftyTwoWeekLow": company.get("weeks52low"),
            "averageVolume10days": company.get("averageVolume10D"),
            # TMX publishes 30-day volume, which must not be mislabeled as 3 months.
            "dividendRate": annual_dividend,
            "dividendYield": (
                dividend_yield / 100 if dividend_yield is not None else None
            ),
            "payoutRatio": payout_ratio,
        },
        "defaultKeyStatistics": {
            "priceToBook": company.get("priceToBook"),
            "trailingEps": company.get("eps"),
            "beta": company.get("beta"),
            "sharesOutstanding": (
                company.get("shareOutStanding")
                if company.get("shareOutStanding") is not None
                else company.get("totalSharesOutStanding")
            ),
        },
        "financialData": {
            "financialCurrency": company.get("currency"),
            "currentPrice": company.get("price"),
        },
    }


class TMXMoneyService:
    fresh_seconds = 1800
    # Long-lived last-good retention belongs to FundamentalsService where age
    # and stale status remain visible to clients.
    stale_seconds = 1800

    def __init__(self) -> None:
        self._cache = shared_data_hub.cache(
            "tmx-money-company",
            max_entries=3000,
        )

    async def _load_company(self, symbol: str) -> dict[str, Any]:
        response = await shared_http_client.request(
            "POST",
            TMX_MONEY_GRAPHQL_URL,
            json={
                "query": _COMPANY_QUERY,
                "variables": {"symbol": _tmx_symbol(symbol), "locale": "en"},
            },
            headers={"Content-Type": "application/json"},
            attempts=2,
        )
        payload = response.json()
        company = (
            payload.get("data", {}).get("getQuoteBySymbol")
            if isinstance(payload, dict)
            else None
        )
        if not isinstance(company, dict) or not company:
            raise RuntimeError("TMX Money company data unavailable")
        if str(company.get("exchangeCode") or "").upper() not in {"TSX", "CDX"}:
            raise RuntimeError("TMX Money result is not a Canadian listing")
        return company

    async def get_company(self, symbol: str) -> dict[str, Any]:
        key = _tmx_symbol(symbol)
        return await self._cache.get_or_load(
            key,
            lambda: self._load_company(symbol),
            fresh_seconds=self.fresh_seconds,
            stale_seconds=self.stale_seconds,
        )

    async def get_summary(self, symbol: str) -> dict[str, Any]:
        return company_to_summary(await self.get_company(symbol))


tmx_money_service = TMXMoneyService()
