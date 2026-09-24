from __future__ import annotations

import asyncio
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

_EARNINGS_QUERY = """
query getEarningsForSymbol($symbol: String!) {
  getEarningsForSymbol(symbol: $symbol) {
    events { date type quarter }
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
        self._earnings_cache = shared_data_hub.cache(
            "tmx-money-earnings",
            max_entries=1500,
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

    async def _load_earnings(self, symbol: str) -> dict[str, Any]:
        response = await shared_http_client.request(
            "POST",
            TMX_MONEY_GRAPHQL_URL,
            json={"query": _EARNINGS_QUERY, "variables": {"symbol": _tmx_symbol(symbol)}},
            headers={
                "Content-Type": "application/json",
                "Origin": "https://money.tmx.com",
                "Referer": "https://money.tmx.com/",
                "User-Agent": "Mozilla/5.0 Anatole/1.0",
                "locale": "en",
            },
            attempts=2,
        )
        payload = response.json()
        if not isinstance(payload, dict) or payload.get("errors"):
            raise RuntimeError("TMX Money earnings data unavailable")
        data = payload.get("data", {}).get("getEarningsForSymbol")
        if not isinstance(data, dict):
            raise RuntimeError("TMX Money earnings result is empty")
        return data

    async def get_earnings(self, symbol: str) -> dict[str, Any]:
        key = _tmx_symbol(symbol)
        return await self._earnings_cache.get_or_load(
            key,
            lambda: self._load_earnings(symbol),
            fresh_seconds=900,
            stale_seconds=86_400,
        )

    async def get_earnings_many(
        self,
        symbols: list[str],
        *,
        concurrency: int = 6,
        deadline_seconds: float = 18.0,
    ) -> tuple[dict[str, dict[str, Any]], int]:
        unique = list(dict.fromkeys(symbols))
        if not unique:
            return {}, 0
        semaphore = asyncio.Semaphore(max(1, concurrency))
        output: dict[str, dict[str, Any]] = {}
        failed = 0

        async def load(symbol: str) -> tuple[str, dict[str, Any] | None, bool]:
            async with semaphore:
                try:
                    return symbol, await self.get_earnings(symbol), False
                except Exception:
                    return symbol, None, True

        tasks = [asyncio.create_task(load(symbol)) for symbol in unique]
        done, pending = await asyncio.wait(tasks, timeout=max(0.5, deadline_seconds))
        for task in pending:
            task.cancel()
        for task in done:
            if task.cancelled():
                failed += 1
                continue
            symbol, value, errored = task.result()
            if errored or value is None:
                failed += 1
            else:
                output[symbol] = value
        failed += len(pending)
        return output, failed


tmx_money_service = TMXMoneyService()
