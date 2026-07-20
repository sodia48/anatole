from __future__ import annotations

import asyncio
import math
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Literal

import httpx

from app.core.config import settings
from app.schemas.fundamentals import (
    AnalystConsensus,
    CorporateEvents,
    EarningsEstimate,
    EarningsQuarter,
    FinancialHighlights,
    FinancialPeriod,
    FundamentalMetrics,
    FundamentalSnapshot,
    TTMSummary,
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
    "earningsHistory",
    "earningsTrend",
    "incomeStatementHistory",
    "incomeStatementHistoryQuarterly",
    "cashflowStatementHistory",
    "cashflowStatementHistoryQuarterly",
    "balanceSheetHistory",
    "balanceSheetHistoryQuarterly",
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
    return parsed if math.isfinite(parsed) else None


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


def safe_div(
    numerator: float | None,
    denominator: float | None,
    *,
    scale: float = 1.0,
) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator * scale


def growth(
    current: float | None,
    previous: float | None,
) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return (current - previous) / abs(previous) * 100


def cagr(
    current: float | None,
    previous: float | None,
    years: float,
) -> float | None:
    if (
        current is None
        or previous is None
        or current <= 0
        or previous <= 0
        or years <= 0
    ):
        return None
    return ((current / previous) ** (1 / years) - 1) * 100


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


def first_number(
    row: dict[str, Any],
    *keys: str,
) -> float | None:
    for key in keys:
        value = number(row.get(key))
        if value is not None:
            return value
    return None


def normalized_capex(value: float | None) -> float | None:
    if value is None:
        return None
    return -abs(value)


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
                "AppleWebKit/537.36 Anatole/0.9"
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

        raise RuntimeError(
            "; ".join(errors) or "Yahoo fundamentals unavailable"
        )

    def _financial_periods(
        self,
        payload: dict[str, Any],
        currency: str | None,
        period_type: Literal["annual", "quarterly"],
    ) -> list[FinancialPeriod]:
        quarterly = period_type == "quarterly"
        suffix = "Quarterly" if quarterly else ""

        income = statement_rows(
            payload,
            f"incomeStatementHistory{suffix}",
            "incomeStatementHistory",
        )
        cashflow = statement_rows(
            payload,
            f"cashflowStatementHistory{suffix}",
            "cashflowStatements",
        )
        balance = statement_rows(
            payload,
            f"balanceSheetHistory{suffix}",
            "balanceSheetStatements",
        )

        merged: dict[int, dict[str, Any]] = {}

        def bucket(row: dict[str, Any]) -> dict[str, Any] | None:
            end = timestamp(row.get("endDate"))
            if end is None:
                return None
            key = int(end.timestamp())
            return merged.setdefault(
                key,
                {
                    "period_end": end,
                    "period_type": period_type,
                    "currency": currency,
                },
            )

        for row in income:
            current = bucket(row)
            if current is None:
                continue

            current.update(
                total_revenue=first_number(row, "totalRevenue"),
                cost_of_revenue=first_number(row, "costOfRevenue"),
                gross_profit=first_number(row, "grossProfit"),
                research_development=first_number(
                    row,
                    "researchDevelopment",
                    "researchAndDevelopment",
                ),
                selling_general_administrative=first_number(
                    row,
                    "sellingGeneralAdministrative",
                    "sellingAndMarketingExpense",
                ),
                total_operating_expenses=first_number(
                    row,
                    "totalOperatingExpenses",
                    "operatingExpense",
                ),
                operating_income=first_number(
                    row,
                    "operatingIncome",
                ),
                ebit=first_number(row, "ebit"),
                ebitda=first_number(row, "ebitda"),
                interest_expense=first_number(
                    row,
                    "interestExpense",
                    "interestExpenseNonOperating",
                ),
                income_before_tax=first_number(
                    row,
                    "incomeBeforeTax",
                    "incomeBeforeTaxExpense",
                ),
                income_tax_expense=first_number(
                    row,
                    "incomeTaxExpense",
                    "taxProvision",
                ),
                net_income=first_number(
                    row,
                    "netIncomeApplicableToCommonShares",
                    "netIncomeCommonStockholders",
                    "netIncome",
                ),
                basic_eps=first_number(row, "basicEPS"),
                diluted_eps=first_number(row, "dilutedEPS"),
                diluted_average_shares=first_number(
                    row,
                    "dilutedAverageShares",
                    "dilutedAverageSharesOutstanding",
                ),
            )

        for row in cashflow:
            current = bucket(row)
            if current is None:
                continue

            operating_cash_flow = first_number(
                row,
                "totalCashFromOperatingActivities",
                "operatingCashFlow",
            )
            capex = normalized_capex(
                first_number(
                    row,
                    "capitalExpenditures",
                    "capitalExpenditure",
                )
            )
            depreciation = first_number(
                row,
                "depreciation",
                "depreciationAndAmortization",
            )
            free_cash_flow = first_number(row, "freeCashFlow")
            if free_cash_flow is None and operating_cash_flow is not None:
                free_cash_flow = (
                    operating_cash_flow + capex
                    if capex is not None
                    else None
                )

            current.update(
                depreciation_amortization=depreciation,
                operating_cash_flow=operating_cash_flow,
                capital_expenditure=capex,
                free_cash_flow=free_cash_flow,
                dividends_paid=first_number(
                    row,
                    "dividendsPaid",
                    "cashDividendsPaid",
                    "commonStockDividendPaid",
                ),
                share_repurchases=first_number(
                    row,
                    "repurchaseOfStock",
                    "repurchaseOfCapitalStock",
                ),
            )

        for row in balance:
            current = bucket(row)
            if current is None:
                continue

            total_cash = first_number(
                row,
                "cash",
                "cashAndCashEquivalents",
                "cashCashEquivalentsAndShortTermInvestments",
            )
            total_debt = first_number(
                row,
                "totalDebt",
                "longTermDebt",
            )

            current.update(
                total_cash=total_cash,
                total_debt=total_debt,
                net_debt=(
                    total_debt - total_cash
                    if total_debt is not None
                    and total_cash is not None
                    else None
                ),
                current_assets=first_number(
                    row,
                    "totalCurrentAssets",
                    "currentAssets",
                ),
                current_liabilities=first_number(
                    row,
                    "totalCurrentLiabilities",
                    "currentLiabilities",
                ),
                total_assets=first_number(row, "totalAssets"),
                total_liabilities=first_number(
                    row,
                    "totalLiab",
                    "totalLiabilitiesNetMinorityInterest",
                    "totalLiabilities",
                ),
                stockholder_equity=first_number(
                    row,
                    "totalStockholderEquity",
                    "stockholdersEquity",
                ),
            )

        rows = [
            entry
            for _, entry in sorted(
                merged.items(),
                key=lambda pair: pair[0],
                reverse=True,
            )
        ]
        comparison_gap = 4 if quarterly else 1

        for index, row in enumerate(rows):
            revenue = row.get("total_revenue")
            gross_profit = row.get("gross_profit")
            operating_income = row.get("operating_income")
            net_income = row.get("net_income")
            free_cash_flow = row.get("free_cash_flow")

            if row.get("ebitda") is None:
                ebit = row.get("ebit")
                depreciation = row.get("depreciation_amortization")
                if ebit is not None and depreciation is not None:
                    row["ebitda"] = ebit + depreciation

            row.update(
                gross_margin=safe_div(
                    gross_profit,
                    revenue,
                    scale=100,
                ),
                operating_margin=safe_div(
                    operating_income,
                    revenue,
                    scale=100,
                ),
                net_margin=safe_div(
                    net_income,
                    revenue,
                    scale=100,
                ),
                free_cash_flow_margin=safe_div(
                    free_cash_flow,
                    revenue,
                    scale=100,
                ),
            )

            prior_index = index + comparison_gap
            if prior_index < len(rows):
                prior = rows[prior_index]
                row.update(
                    revenue_growth_yoy=growth(
                        revenue,
                        prior.get("total_revenue"),
                    ),
                    operating_income_growth_yoy=growth(
                        operating_income,
                        prior.get("operating_income"),
                    ),
                    net_income_growth_yoy=growth(
                        net_income,
                        prior.get("net_income"),
                    ),
                    eps_growth_yoy=growth(
                        row.get("diluted_eps"),
                        prior.get("diluted_eps"),
                    ),
                    free_cash_flow_growth_yoy=growth(
                        free_cash_flow,
                        prior.get("free_cash_flow"),
                    ),
                )

        limit = 12 if quarterly else 5
        return [FinancialPeriod(**row) for row in rows[:limit]]

    def _ttm(
        self,
        quarterly: list[FinancialPeriod],
        currency: str | None,
    ) -> TTMSummary:
        recent = quarterly[:4]
        if not recent:
            return TTMSummary(currency=currency)

        def total(field: str) -> float | None:
            values = [
                getattr(period, field)
                for period in recent
                if getattr(period, field) is not None
            ]
            return sum(values) if values else None

        revenue = total("total_revenue")
        gross_profit = total("gross_profit")
        operating_income = total("operating_income")
        net_income = total("net_income")
        free_cash_flow = total("free_cash_flow")
        latest = recent[0]

        return TTMSummary(
            period_end=latest.period_end,
            currency=currency,
            total_revenue=revenue,
            gross_profit=gross_profit,
            operating_income=operating_income,
            ebitda=total("ebitda"),
            net_income=net_income,
            diluted_eps=total("diluted_eps"),
            operating_cash_flow=total("operating_cash_flow"),
            capital_expenditure=total("capital_expenditure"),
            free_cash_flow=free_cash_flow,
            dividends_paid=total("dividends_paid"),
            share_repurchases=total("share_repurchases"),
            total_cash=latest.total_cash,
            total_debt=latest.total_debt,
            net_debt=latest.net_debt,
            gross_margin=safe_div(
                gross_profit,
                revenue,
                scale=100,
            ),
            operating_margin=safe_div(
                operating_income,
                revenue,
                scale=100,
            ),
            net_margin=safe_div(
                net_income,
                revenue,
                scale=100,
            ),
            free_cash_flow_margin=safe_div(
                free_cash_flow,
                revenue,
                scale=100,
            ),
        )

    def _highlights(
        self,
        annual: list[FinancialPeriod],
        quarterly: list[FinancialPeriod],
        ttm: TTMSummary,
    ) -> FinancialHighlights:
        latest = quarterly[0] if quarterly else None

        revenue_cagr = None
        net_income_cagr = None
        fcf_cagr = None

        if len(annual) >= 4:
            current = annual[0]
            previous = annual[3]
            years = max(
                (
                    current.period_end - previous.period_end
                ).days
                / 365.25,
                1.0,
            )
            revenue_cagr = cagr(
                current.total_revenue,
                previous.total_revenue,
                years,
            )
            net_income_cagr = cagr(
                current.net_income,
                previous.net_income,
                years,
            )
            fcf_cagr = cagr(
                current.free_cash_flow,
                previous.free_cash_flow,
                years,
            )

        return FinancialHighlights(
            latest_period_end=latest.period_end if latest else None,
            revenue_growth_yoy=(
                latest.revenue_growth_yoy if latest else None
            ),
            operating_income_growth_yoy=(
                latest.operating_income_growth_yoy if latest else None
            ),
            net_income_growth_yoy=(
                latest.net_income_growth_yoy if latest else None
            ),
            eps_growth_yoy=(
                latest.eps_growth_yoy if latest else None
            ),
            free_cash_flow_growth_yoy=(
                latest.free_cash_flow_growth_yoy if latest else None
            ),
            three_year_revenue_cagr=revenue_cagr,
            three_year_net_income_cagr=net_income_cagr,
            three_year_free_cash_flow_cagr=fcf_cagr,
            cash_conversion_percent=safe_div(
                ttm.free_cash_flow,
                ttm.net_income,
                scale=100,
            ),
            net_debt_to_ebitda=safe_div(
                ttm.net_debt,
                ttm.ebitda,
            ),
        )

    def _earnings_history(
        self,
        payload: dict[str, Any],
    ) -> list[EarningsQuarter]:
        rows = (
            module_data(payload, "earningsHistory").get("history")
            or module_data(payload, "earnings")
            .get("earningsChart", {})
            .get("quarterly", [])
        )
        output: list[EarningsQuarter] = []

        for row in rows:
            if not isinstance(row, dict):
                continue
            actual = number(
                row.get("epsActual")
                or row.get("actual")
            )
            estimate = number(
                row.get("epsEstimate")
                or row.get("estimate")
            )
            surprise = percent(row.get("surprisePercent"))
            if surprise is None and actual is not None and estimate not in (None, 0):
                surprise = (actual - estimate) / abs(estimate) * 100

            period_value = (
                row.get("quarter")
                or row.get("period")
                or row.get("date")
                or "N/D"
            )
            parsed_period = timestamp(period_value)

            output.append(
                EarningsQuarter(
                    period=(
                        parsed_period.strftime("%Y-%m-%d")
                        if parsed_period is not None
                        else str(period_value)
                    ),
                    actual=actual,
                    estimate=estimate,
                    surprise_percent=surprise,
                )
            )

        return output[-12:]

    def _earnings_estimates(
        self,
        payload: dict[str, Any],
    ) -> list[EarningsEstimate]:
        rows = module_data(payload, "earningsTrend").get("trend") or []
        output: list[EarningsEstimate] = []

        for row in rows:
            if not isinstance(row, dict):
                continue

            eps = row.get("earningsEstimate") or {}
            revenue = row.get("revenueEstimate") or {}

            output.append(
                EarningsEstimate(
                    period=str(row.get("period") or "N/D"),
                    end_date=str(row.get("endDate") or "") or None,
                    eps_average=number(eps.get("avg")),
                    eps_low=number(eps.get("low")),
                    eps_high=number(eps.get("high")),
                    eps_year_ago=number(eps.get("yearAgoEps")),
                    eps_growth=percent(eps.get("growth")),
                    eps_analyst_count=integer(
                        eps.get("numberOfAnalysts")
                    ),
                    revenue_average=number(revenue.get("avg")),
                    revenue_low=number(revenue.get("low")),
                    revenue_high=number(revenue.get("high")),
                    revenue_year_ago=number(
                        revenue.get("yearAgoRevenue")
                    ),
                    revenue_growth=percent(revenue.get("growth")),
                    revenue_analyst_count=integer(
                        revenue.get("numberOfAnalysts")
                    ),
                )
            )

        return output

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
            price_to_sales=number(
                detail.get("priceToSalesTrailing12Months")
            ),
            enterprise_to_revenue=number(
                stats.get("enterpriseToRevenue")
            ),
            enterprise_to_ebitda=number(
                stats.get("enterpriseToEbitda")
            ),
            trailing_eps=number(stats.get("trailingEps")),
            forward_eps=number(stats.get("forwardEps")),
            beta=number(stats.get("beta")),
            fifty_two_week_high=number(
                detail.get("fiftyTwoWeekHigh")
            ),
            fifty_two_week_low=number(
                detail.get("fiftyTwoWeekLow")
            ),
            average_volume_10d=number(
                detail.get("averageVolume10days")
            ),
            average_volume_3m=number(detail.get("averageVolume")),
            shares_outstanding=number(stats.get("sharesOutstanding")),
            dividend_rate=number(detail.get("dividendRate")),
            dividend_yield=percent(detail.get("dividendYield")),
            payout_ratio=percent(detail.get("payoutRatio")),
            total_revenue=number(financial.get("totalRevenue")),
            revenue_per_share=number(
                financial.get("revenuePerShare")
            ),
            gross_profit=number(financial.get("grossProfits")),
            ebitda=number(financial.get("ebitda")),
            net_income_to_common=number(
                financial.get("netIncomeToCommon")
            ),
            free_cash_flow=number(financial.get("freeCashflow")),
            operating_cash_flow=number(
                financial.get("operatingCashflow")
            ),
            total_cash=number(financial.get("totalCash")),
            total_debt=number(financial.get("totalDebt")),
            debt_to_equity=number(financial.get("debtToEquity")),
            current_ratio=number(financial.get("currentRatio")),
            quick_ratio=number(financial.get("quickRatio")),
            gross_margin=percent(financial.get("grossMargins")),
            operating_margin=percent(
                financial.get("operatingMargins")
            ),
            profit_margin=percent(financial.get("profitMargins")),
            return_on_assets=percent(
                financial.get("returnOnAssets")
            ),
            return_on_equity=percent(
                financial.get("returnOnEquity")
            ),
            revenue_growth=percent(financial.get("revenueGrowth")),
            earnings_growth=percent(
                financial.get("earningsGrowth")
            ),
        )

        annual = self._financial_periods(
            payload,
            currency,
            "annual",
        )
        quarterly = self._financial_periods(
            payload,
            currency,
            "quarterly",
        )
        ttm = self._ttm(quarterly, currency)
        highlights = self._highlights(
            annual,
            quarterly,
            ttm,
        )
        earnings = self._earnings_history(payload)
        estimates = self._earnings_estimates(payload)
        analysts = self._analysts(payload)
        events = self._events(payload)

        available_values = sum(
            value is not None
            for value in metrics.model_dump().values()
        )
        statement_count = len(annual) + len(quarterly)
        status = (
            "available"
            if available_values >= 18 and statement_count >= 4
            else "partial"
        )

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
            message=(
                None
                if status == "available"
                else (
                    "Certaines lignes financières ne sont pas "
                    "publiées par la source pour cette société."
                )
            ),
            metrics=metrics,
            annual_financials=annual,
            quarterly_financials=quarterly,
            ttm=ttm,
            highlights=highlights,
            earnings_history=earnings,
            earnings_estimates=estimates,
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
            ttm=TTMSummary(),
            highlights=FinancialHighlights(),
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
