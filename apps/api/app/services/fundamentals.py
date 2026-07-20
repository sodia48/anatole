from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import monotonic
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.fundamentals import (
    AnalystConsensus,
    AnnualFinancial,
    CorporateEvents,
    EarningsQuarter,
    FundamentalMetrics,
    FundamentalSnapshot,
)
from app.services.market_data import market_data_service


MODULES = (
    "assetProfile",
    "price",
    "summaryDetail",
    "defaultKeyStatistics",
    "financialData",
    "calendarEvents",
    "recommendationTrend",
    "earnings",
    "earningsTrend",
    "incomeStatementHistory",
    "cashflowStatementHistory",
    "balanceSheetHistory",
)


def raw(value: Any) -> Any:
    if isinstance(value, dict):
        if "raw" in value:
            return value.get("raw")
        if "fmt" in value and len(value) == 1:
            return value.get("fmt")
    return value


def number(value: Any) -> float | None:
    value = raw(value)
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def integer(value: Any) -> int | None:
    parsed = number(value)
    return int(parsed) if parsed is not None else None


def timestamp(value: Any) -> datetime | None:
    parsed = number(value)
    if parsed is None or parsed <= 0:
        return None
    return datetime.fromtimestamp(parsed, UTC)


def percent(value: Any) -> float | None:
    parsed = number(value)
    return parsed * 100 if parsed is not None else None


def module_data(payload: dict[str, Any], name: str) -> dict[str, Any]:
    value = payload.get(name)
    return value if isinstance(value, dict) else {}


def statement_rows(
    payload: dict[str, Any],
    module: str,
    key: str,
) -> list[dict[str, Any]]:
    rows = module_data(payload, module).get(key) or []
    return [row for row in rows if isinstance(row, dict)]


class FundamentalsService:
    cache_ttl_seconds = 1800
    unavailable_ttl_seconds = 300

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, FundamentalSnapshot]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, symbol: str) -> asyncio.Lock:
        lock = self._locks.get(symbol)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[symbol] = lock
        return lock

    async def _credentials(
        self,
        client: httpx.AsyncClient,
    ) -> str | None:
        try:
            # Yahoo dépose généralement le cookie sur cette requête.
            await client.get("https://fc.yahoo.com", timeout=6.0)
        except httpx.HTTPError:
            pass

        try:
            response = await client.get(
                "https://query1.finance.yahoo.com/v1/test/getcrumb",
                timeout=8.0,
            )
            response.raise_for_status()
            crumb = response.text.strip()
            return crumb or None
        except httpx.HTTPError:
            return None

    async def _request_summary(
        self,
        symbol: str,
    ) -> dict[str, Any]:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Anatole/0.8"
            ),
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8",
            "Referer": f"https://finance.yahoo.com/quote/{symbol}",
        }
        timeout_seconds = max(
            8.0,
            float(settings.yahoo_timeout_seconds),
        )
        timeout = httpx.Timeout(
            connect=min(timeout_seconds, 8.0),
            read=timeout_seconds,
            write=8.0,
            pool=8.0,
        )

        async with httpx.AsyncClient(
            headers=headers,
            timeout=timeout,
            follow_redirects=True,
        ) as client:
            crumb = await self._credentials(client)
            params: dict[str, str] = {
                "modules": ",".join(MODULES),
                "corsDomain": "finance.yahoo.com",
                "formatted": "false",
                "lang": "en-CA",
                "region": "CA",
            }
            if crumb:
                params["crumb"] = crumb

            errors: list[str] = []
            for host in (
                "https://query2.finance.yahoo.com",
                "https://query1.finance.yahoo.com",
            ):
                try:
                    response = await client.get(
                        f"{host}/v10/finance/quoteSummary/{symbol}",
                        params=params,
                    )
                    response.raise_for_status()
                    body = response.json()
                    result = (
                        body.get("quoteSummary", {}).get("result")
                        or []
                    )
                    if result and isinstance(result[0], dict):
                        return result[0]
                    error = body.get("quoteSummary", {}).get("error")
                    errors.append(str(error or "empty result"))
                except (httpx.HTTPError, ValueError) as exc:
                    errors.append(f"{host}: {type(exc).__name__}: {exc}")

        raise RuntimeError("; ".join(errors) or "Yahoo fundamentals unavailable")

    def _annual_financials(
        self,
        payload: dict[str, Any],
        currency: str | None,
    ) -> list[AnnualFinancial]:
        income = statement_rows(
            payload,
            "incomeStatementHistory",
            "incomeStatementHistory",
        )
        cashflow = statement_rows(
            payload,
            "cashflowStatementHistory",
            "cashflowStatements",
        )
        balance = statement_rows(
            payload,
            "balanceSheetHistory",
            "balanceSheetStatements",
        )

        merged: dict[int, dict[str, Any]] = {}

        def bucket(row: dict[str, Any]) -> dict[str, Any] | None:
            end = timestamp(row.get("endDate"))
            if end is None:
                return None
            key = int(end.timestamp())
            current = merged.setdefault(
                key,
                {"period_end": end, "currency": currency},
            )
            return current

        for row in income:
            current = bucket(row)
            if current is None:
                continue
            current.update(
                total_revenue=number(row.get("totalRevenue")),
                gross_profit=number(row.get("grossProfit")),
                operating_income=number(row.get("operatingIncome")),
                net_income=number(
                    row.get("netIncomeApplicableToCommonShares")
                    or row.get("netIncome")
                ),
            )

        for row in cashflow:
            current = bucket(row)
            if current is None:
                continue
            operating_cash_flow = number(
                row.get("totalCashFromOperatingActivities")
                or row.get("operatingCashFlow")
            )
            capital_expenditure = number(row.get("capitalExpenditures"))
            free_cash_flow = None
            if operating_cash_flow is not None and capital_expenditure is not None:
                # Yahoo publie habituellement les dépenses en immobilisations négatives.
                free_cash_flow = operating_cash_flow + capital_expenditure
            current.update(
                operating_cash_flow=operating_cash_flow,
                capital_expenditure=capital_expenditure,
                free_cash_flow=free_cash_flow,
            )

        for row in balance:
            current = bucket(row)
            if current is None:
                continue
            current.update(
                total_cash=number(
                    row.get("cash")
                    or row.get("cashAndCashEquivalents")
                ),
                total_debt=number(row.get("totalDebt")),
                total_assets=number(row.get("totalAssets")),
                stockholder_equity=number(
                    row.get("totalStockholderEquity")
                ),
            )

        return [
            AnnualFinancial(**entry)
            for _, entry in sorted(
                merged.items(),
                key=lambda pair: pair[0],
                reverse=True,
            )[:4]
        ]

    def _earnings_history(
        self,
        payload: dict[str, Any],
    ) -> list[EarningsQuarter]:
        quarterly = (
            module_data(payload, "earnings")
            .get("earningsChart", {})
            .get("quarterly", [])
        )
        output: list[EarningsQuarter] = []

        for row in quarterly:
            if not isinstance(row, dict):
                continue
            actual = number(row.get("actual"))
            estimate = number(row.get("estimate"))
            surprise = None
            if actual is not None and estimate not in (None, 0):
                surprise = (actual - estimate) / abs(estimate) * 100
            output.append(
                EarningsQuarter(
                    period=str(row.get("date") or "N/D"),
                    actual=actual,
                    estimate=estimate,
                    surprise_percent=surprise,
                )
            )

        return output[-8:]

    def _events(
        self,
        payload: dict[str, Any],
    ) -> CorporateEvents:
        calendar = module_data(payload, "calendarEvents")
        earnings = calendar.get("earnings") or {}
        earnings_dates = [
            parsed
            for value in earnings.get("earningsDate", [])
            if (parsed := timestamp(value)) is not None
        ]
        return CorporateEvents(
            earnings_dates=earnings_dates,
            ex_dividend_date=timestamp(calendar.get("exDividendDate")),
            dividend_date=timestamp(calendar.get("dividendDate")),
        )

    def _analysts(
        self,
        payload: dict[str, Any],
    ) -> AnalystConsensus:
        financial = module_data(payload, "financialData")
        trend = (
            module_data(payload, "recommendationTrend").get("trend")
            or []
        )
        current_trend = next(
            (
                row
                for row in trend
                if isinstance(row, dict)
                and row.get("period") in {"0m", "-1m"}
            ),
            trend[0] if trend else {},
        )
        current_price = number(financial.get("currentPrice"))
        target_mean = number(financial.get("targetMeanPrice"))
        upside = None
        if current_price not in (None, 0) and target_mean is not None:
            upside = (target_mean - current_price) / current_price * 100

        return AnalystConsensus(
            recommendation_key=str(
                financial.get("recommendationKey")
            )
            if financial.get("recommendationKey")
            else None,
            recommendation_mean=number(
                financial.get("recommendationMean")
            ),
            analyst_count=integer(
                financial.get("numberOfAnalystOpinions")
            ),
            target_low=number(financial.get("targetLowPrice")),
            target_mean=target_mean,
            target_median=number(
                financial.get("targetMedianPrice")
            ),
            target_high=number(financial.get("targetHighPrice")),
            current_price=current_price,
            upside_to_mean_percent=upside,
            strong_buy=integer(current_trend.get("strongBuy")),
            buy=integer(current_trend.get("buy")),
            hold=integer(current_trend.get("hold")),
            sell=integer(current_trend.get("sell")),
            strong_sell=integer(current_trend.get("strongSell")),
        )

    def _snapshot(
        self,
        ticker: str,
        symbol: str,
        payload: dict[str, Any],
    ) -> FundamentalSnapshot:
        profile = module_data(payload, "assetProfile")
        price = module_data(payload, "price")
        detail = module_data(payload, "summaryDetail")
        stats = module_data(payload, "defaultKeyStatistics")
        financial = module_data(payload, "financialData")

        currency = str(
            price.get("currency")
            or financial.get("financialCurrency")
            or ""
        ) or None

        metrics = FundamentalMetrics(
            market_cap=number(price.get("marketCap")),
            enterprise_value=number(stats.get("enterpriseValue")),
            trailing_pe=number(detail.get("trailingPE")),
            forward_pe=number(detail.get("forwardPE")),
            price_to_book=number(stats.get("priceToBook")),
            price_to_sales=number(detail.get("priceToSalesTrailing12Months")),
            enterprise_to_revenue=number(stats.get("enterpriseToRevenue")),
            enterprise_to_ebitda=number(stats.get("enterpriseToEbitda")),
            trailing_eps=number(stats.get("trailingEps")),
            forward_eps=number(stats.get("forwardEps")),
            beta=number(stats.get("beta")),
            fifty_two_week_high=number(detail.get("fiftyTwoWeekHigh")),
            fifty_two_week_low=number(detail.get("fiftyTwoWeekLow")),
            average_volume_10d=number(detail.get("averageVolume10days")),
            average_volume_3m=number(detail.get("averageVolume")),
            shares_outstanding=number(stats.get("sharesOutstanding")),
            dividend_rate=number(detail.get("dividendRate")),
            dividend_yield=percent(detail.get("dividendYield")),
            payout_ratio=percent(detail.get("payoutRatio")),
            total_revenue=number(financial.get("totalRevenue")),
            revenue_per_share=number(financial.get("revenuePerShare")),
            gross_profit=number(financial.get("grossProfits")),
            ebitda=number(financial.get("ebitda")),
            net_income_to_common=number(financial.get("netIncomeToCommon")),
            free_cash_flow=number(financial.get("freeCashflow")),
            operating_cash_flow=number(financial.get("operatingCashflow")),
            total_cash=number(financial.get("totalCash")),
            total_debt=number(financial.get("totalDebt")),
            debt_to_equity=number(financial.get("debtToEquity")),
            current_ratio=number(financial.get("currentRatio")),
            quick_ratio=number(financial.get("quickRatio")),
            gross_margin=percent(financial.get("grossMargins")),
            operating_margin=percent(financial.get("operatingMargins")),
            profit_margin=percent(financial.get("profitMargins")),
            return_on_assets=percent(financial.get("returnOnAssets")),
            return_on_equity=percent(financial.get("returnOnEquity")),
            revenue_growth=percent(financial.get("revenueGrowth")),
            earnings_growth=percent(financial.get("earningsGrowth")),
        )

        annual = self._annual_financials(payload, currency)
        earnings = self._earnings_history(payload)
        analysts = self._analysts(payload)
        events = self._events(payload)

        available_values = sum(
            value is not None
            for value in metrics.model_dump().values()
        )
        status = "available" if available_values >= 18 else "partial"

        return FundamentalSnapshot(
            ticker=symbol,
            symbol=symbol.removesuffix(".TO").replace("-", "."),
            name=str(
                price.get("longName")
                or price.get("shortName")
                or symbol.removesuffix(".TO")
            ),
            exchange=str(price.get("exchangeName") or "") or None,
            currency=currency,
            sector=str(profile.get("sector") or "") or None,
            industry=str(profile.get("industry") or "") or None,
            status=status,
            message=None
            if status == "available"
            else "Certaines données fondamentales ne sont pas publiées par la source.",
            metrics=metrics,
            annual_financials=annual,
            earnings_history=earnings,
            analysts=analysts,
            events=events,
            source="Yahoo Finance public quoteSummary",
            generated_at=datetime.now(UTC),
            refresh_after_seconds=self.cache_ttl_seconds,
        )

    def _unavailable(
        self,
        ticker: str,
        symbol: str,
        message: str,
    ) -> FundamentalSnapshot:
        return FundamentalSnapshot(
            ticker=symbol,
            symbol=symbol.removesuffix(".TO").replace("-", "."),
            name=ticker.strip().upper(),
            status="unavailable",
            message=message,
            metrics=FundamentalMetrics(),
            analysts=AnalystConsensus(),
            events=CorporateEvents(),
            source="Yahoo Finance public quoteSummary",
            generated_at=datetime.now(UTC),
            refresh_after_seconds=self.unavailable_ttl_seconds,
        )

    async def get_snapshot(
        self,
        ticker: str,
    ) -> FundamentalSnapshot:
        symbol = market_data_service.normalize_ticker(ticker)
        cached = self._cache.get(symbol)
        now = monotonic()

        if cached and now - cached[0] < cached[1].refresh_after_seconds:
            return cached[1]

        async with self._lock_for(symbol):
            cached = self._cache.get(symbol)
            now = monotonic()
            if cached and now - cached[0] < cached[1].refresh_after_seconds:
                return cached[1]

            try:
                payload = await self._request_summary(symbol)
                snapshot = self._snapshot(ticker, symbol, payload)
            except Exception as exc:  # noqa: BLE001
                snapshot = self._unavailable(
                    ticker,
                    symbol,
                    (
                        "La source fondamentale publique est temporairement "
                        f"indisponible ({type(exc).__name__})."
                    ),
                )

            self._cache[symbol] = (monotonic(), snapshot)
            return snapshot


fundamentals_service = FundamentalsService()
