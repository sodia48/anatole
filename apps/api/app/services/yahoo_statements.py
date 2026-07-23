from __future__ import annotations

import asyncio
import math
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from time import monotonic
from typing import Any, Literal

import pandas as pd

from app.schemas.fundamentals import (
    FinancialPeriod,
    FinancialSource,
    YahooStatementsDiagnostics,
)
from app.services.market_data import market_data_service


PeriodType = Literal["annual", "quarterly"]

VALUE_FIELDS = (
    "total_revenue",
    "cost_of_revenue",
    "gross_profit",
    "research_development",
    "selling_general_administrative",
    "total_operating_expenses",
    "operating_income",
    "ebit",
    "depreciation_amortization",
    "ebitda",
    "interest_expense",
    "income_before_tax",
    "income_tax_expense",
    "net_income",
    "basic_eps",
    "diluted_eps",
    "diluted_average_shares",
    "operating_cash_flow",
    "capital_expenditure",
    "free_cash_flow",
    "dividends_paid",
    "share_repurchases",
    "total_cash",
    "total_debt",
    "net_debt",
    "current_assets",
    "current_liabilities",
    "total_assets",
    "total_liabilities",
    "stockholder_equity",
)

INCOME_ALIASES: dict[str, tuple[str, ...]] = {
    "total_revenue": ("TotalRevenue", "OperatingRevenue", "Revenue"),
    "cost_of_revenue": (
        "CostOfRevenue",
        "CostOfGoodsAndServicesSold",
        "CostOfSales",
    ),
    "gross_profit": ("GrossProfit",),
    "research_development": (
        "ResearchAndDevelopment",
        "ResearchDevelopment",
    ),
    "selling_general_administrative": (
        "SellingGeneralAndAdministration",
        "SellingGeneralAdministrative",
        "GeneralAndAdministrativeExpense",
    ),
    "total_operating_expenses": (
        "OperatingExpense",
        "TotalOperatingExpenses",
    ),
    "operating_income": (
        "OperatingIncome",
        "TotalOperatingIncomeAsReported",
    ),
    "ebit": ("EBIT", "NormalizedEBIT"),
    "depreciation_amortization": (
        "ReconciledDepreciation",
        "DepreciationAndAmortizationInIncomeStatement",
    ),
    "ebitda": ("EBITDA", "NormalizedEBITDA"),
    "interest_expense": (
        "InterestExpense",
        "InterestExpenseNonOperating",
        "NetInterestIncome",
    ),
    "income_before_tax": ("PretaxIncome", "IncomeBeforeTax"),
    "income_tax_expense": ("TaxProvision", "IncomeTaxExpense"),
    "net_income": (
        "NetIncomeCommonStockholders",
        "NetIncome",
        "NetIncomeIncludingNoncontrollingInterests",
    ),
    "basic_eps": ("BasicEPS", "BasicEarningsPerShare"),
    "diluted_eps": ("DilutedEPS", "DilutedEarningsPerShare"),
    "diluted_average_shares": (
        "DilutedAverageShares",
        "WeightedAverageNumberOfDilutedSharesOutstanding",
    ),
}

CASHFLOW_ALIASES: dict[str, tuple[str, ...]] = {
    "operating_cash_flow": (
        "OperatingCashFlow",
        "TotalCashFromOperatingActivities",
        "CashFlowFromContinuingOperatingActivities",
    ),
    "capital_expenditure": (
        "CapitalExpenditure",
        "CapitalExpenditures",
        "PurchaseOfPPE",
        "NetPPEPurchases",
    ),
    "free_cash_flow": ("FreeCashFlow",),
    "dividends_paid": (
        "CashDividendsPaid",
        "CommonStockDividendPaid",
        "DividendsPaid",
    ),
    "share_repurchases": (
        "RepurchaseOfCapitalStock",
        "RepurchaseOfStock",
    ),
    "depreciation_amortization": (
        "DepreciationAndAmortization",
        "Depreciation",
    ),
}

BALANCE_ALIASES: dict[str, tuple[str, ...]] = {
    "total_cash": (
        "CashCashEquivalentsAndShortTermInvestments",
        "CashAndCashEquivalents",
        "CashFinancial",
        "Cash",
    ),
    "total_debt": ("TotalDebt", "TotalInterestBearingDebt"),
    "_current_debt": (
        "CurrentDebtAndCapitalLeaseObligation",
        "CurrentDebt",
        "CurrentPortionOfLongTermDebt",
    ),
    "_long_term_debt": (
        "LongTermDebtAndCapitalLeaseObligation",
        "LongTermDebt",
        "LongTermDebtNoncurrent",
    ),
    "current_assets": ("CurrentAssets", "TotalCurrentAssets"),
    "current_liabilities": (
        "CurrentLiabilities",
        "TotalCurrentLiabilities",
    ),
    "total_assets": ("TotalAssets",),
    "total_liabilities": (
        "TotalLiabilitiesNetMinorityInterest",
        "TotalLiabilities",
    ),
    "stockholder_equity": (
        "StockholdersEquity",
        "TotalEquityGrossMinorityInterest",
        "CommonStockEquity",
        "TotalStockholderEquity",
    ),
}


@dataclass(slots=True)
class YahooStatementsResult:
    ticker: str
    normalized_symbol: str
    currency: str | None
    annual: list[FinancialPeriod]
    quarterly: list[FinancialPeriod]
    error: str | None = None


def _normalized_label(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, pd.Series):
        for candidate in value.tolist():
            parsed = _number(candidate)
            if parsed is not None:
                return parsed
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _datetime(value: Any) -> datetime | None:
    try:
        parsed = pd.Timestamp(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(parsed):
        return None
    converted = parsed.to_pydatetime()
    if converted.tzinfo is None:
        return converted.replace(tzinfo=UTC)
    return converted.astimezone(UTC)


def _column_map(frame: pd.DataFrame) -> dict[date, Any]:
    output: dict[date, Any] = {}
    if frame.empty:
        return output
    for column in frame.columns:
        parsed = _datetime(column)
        if parsed is not None:
            output[parsed.date()] = column
    return output


def _index_map(frame: pd.DataFrame) -> dict[str, Any]:
    output: dict[str, Any] = {}
    if frame.empty:
        return output
    for label in frame.index:
        output.setdefault(_normalized_label(label), label)
    return output


def _value(
    frame: pd.DataFrame,
    column: Any | None,
    aliases: tuple[str, ...],
) -> float | None:
    if frame.empty or column is None:
        return None
    index = _index_map(frame)
    for alias in aliases:
        label = index.get(_normalized_label(alias))
        if label is None:
            continue
        try:
            parsed = _number(frame.loc[label, column])
        except (KeyError, IndexError):
            parsed = None
        if parsed is not None:
            return parsed
    return None


def _calculated(
    row: dict[str, Any],
    field: str,
    value: float | None,
) -> None:
    if value is None or row.get(field) is not None:
        return
    row[field] = value
    calculated = set(row.get("calculated_fields") or [])
    calculated.add(field)
    row["calculated_fields"] = sorted(calculated)


def _derive_exact_fields(row: dict[str, Any]) -> dict[str, Any]:
    current_debt = row.pop("_current_debt", None)
    long_term_debt = row.pop("_long_term_debt", None)

    if row.get("total_debt") is None and (
        current_debt is not None or long_term_debt is not None
    ):
        _calculated(
            row,
            "total_debt",
            (current_debt or 0) + (long_term_debt or 0),
        )

    _calculated(
        row,
        "net_debt",
        row["total_debt"] - row["total_cash"]
        if row.get("total_debt") is not None
        and row.get("total_cash") is not None
        else None,
    )
    _calculated(
        row,
        "gross_profit",
        row["total_revenue"] - row["cost_of_revenue"]
        if row.get("total_revenue") is not None
        and row.get("cost_of_revenue") is not None
        else None,
    )
    _calculated(
        row,
        "free_cash_flow",
        row["operating_cash_flow"] + row["capital_expenditure"]
        if row.get("operating_cash_flow") is not None
        and row.get("capital_expenditure") is not None
        else None,
    )
    _calculated(
        row,
        "ebitda",
        row["ebit"] + abs(row["depreciation_amortization"])
        if row.get("ebit") is not None
        and row.get("depreciation_amortization") is not None
        else None,
    )
    _calculated(
        row,
        "stockholder_equity",
        row["total_assets"] - row["total_liabilities"]
        if row.get("total_assets") is not None
        and row.get("total_liabilities") is not None
        else None,
    )
    _calculated(
        row,
        "total_liabilities",
        row["total_assets"] - row["stockholder_equity"]
        if row.get("total_assets") is not None
        and row.get("stockholder_equity") is not None
        else None,
    )
    _calculated(
        row,
        "total_assets",
        row["total_liabilities"] + row["stockholder_equity"]
        if row.get("total_liabilities") is not None
        and row.get("stockholder_equity") is not None
        else None,
    )
    return row


class YahooStatementsService:
    cache_ttl_seconds = 1800
    failed_ttl_seconds = 300
    request_timeout_seconds = 35

    def __init__(self) -> None:
        self._cache: dict[
            str, tuple[float, YahooStatementsResult]
        ] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, symbol: str) -> asyncio.Lock:
        lock = self._locks.get(symbol)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[symbol] = lock
        return lock

    @staticmethod
    def _safe_frame(
        callback: Any,
        errors: list[str],
        name: str,
    ) -> pd.DataFrame:
        try:
            frame = callback()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
            return pd.DataFrame()
        return (
            frame.copy()
            if isinstance(frame, pd.DataFrame)
            else pd.DataFrame()
        )

    def _fetch_sync(
        self,
        symbol: str,
    ) -> tuple[dict[str, pd.DataFrame], str | None, list[str]]:
        try:
            import yfinance as yf
        except ImportError as exc:
            raise RuntimeError("yfinance is not installed") from exc

        ticker = yf.Ticker(symbol)
        errors: list[str] = []
        frames = {
            "annual_income": self._safe_frame(
                lambda: ticker.get_income_stmt(
                    pretty=False, freq="yearly"
                ),
                errors,
                "annual income",
            ),
            "annual_balance": self._safe_frame(
                lambda: ticker.get_balance_sheet(
                    pretty=False, freq="yearly"
                ),
                errors,
                "annual balance",
            ),
            "annual_cashflow": self._safe_frame(
                lambda: ticker.get_cash_flow(
                    pretty=False, freq="yearly"
                ),
                errors,
                "annual cash flow",
            ),
            "quarterly_income": self._safe_frame(
                lambda: ticker.get_income_stmt(
                    pretty=False, freq="quarterly"
                ),
                errors,
                "quarterly income",
            ),
            "quarterly_balance": self._safe_frame(
                lambda: ticker.get_balance_sheet(
                    pretty=False, freq="quarterly"
                ),
                errors,
                "quarterly balance",
            ),
            "quarterly_cashflow": self._safe_frame(
                lambda: ticker.get_cash_flow(
                    pretty=False, freq="quarterly"
                ),
                errors,
                "quarterly cash flow",
            ),
        }

        currency: str | None = None
        try:
            fast_info = ticker.fast_info
            value = (
                fast_info.get("currency")
                if hasattr(fast_info, "get")
                else getattr(fast_info, "currency", None)
            )
            if value:
                currency = str(value).upper()
        except Exception:  # noqa: BLE001
            currency = None

        return frames, currency, errors

    @staticmethod
    def _periods(
        *,
        symbol: str,
        income: pd.DataFrame,
        balance: pd.DataFrame,
        cashflow: pd.DataFrame,
        period_type: PeriodType,
        currency: str | None,
    ) -> list[FinancialPeriod]:
        income_columns = _column_map(income)
        balance_columns = _column_map(balance)
        cashflow_columns = _column_map(cashflow)
        dates = sorted(
            set(income_columns)
            | set(balance_columns)
            | set(cashflow_columns),
            reverse=True,
        )

        source = FinancialSource(
            source_type="yahoo_structured",
            source_name=(
                "Yahoo Finance structured financial statements "
                "(via yfinance)"
            ),
            source_url=(
                f"https://finance.yahoo.com/quote/{symbol}/financials/"
            ),
            form=(
                "Annual financial statements"
                if period_type == "annual"
                else "Quarterly financial statements"
            ),
            confidence="secondary",
        )

        output: list[FinancialPeriod] = []
        for period_date in dates:
            row: dict[str, Any] = {
                "period_end": datetime(
                    period_date.year,
                    period_date.month,
                    period_date.day,
                    tzinfo=UTC,
                ),
                "period_type": period_type,
                "currency": currency,
                "source": source,
                "calculated_fields": [],
            }
            income_column = income_columns.get(period_date)
            balance_column = balance_columns.get(period_date)
            cashflow_column = cashflow_columns.get(period_date)

            for field, aliases in INCOME_ALIASES.items():
                row[field] = _value(income, income_column, aliases)

            for field, aliases in CASHFLOW_ALIASES.items():
                value = _value(cashflow, cashflow_column, aliases)
                if field in {
                    "capital_expenditure",
                    "dividends_paid",
                    "share_repurchases",
                } and value is not None:
                    value = -abs(value)
                row[field] = value

            for field, aliases in BALANCE_ALIASES.items():
                row[field] = _value(balance, balance_column, aliases)

            row = _derive_exact_fields(row)
            populated = sum(
                row.get(field) is not None for field in VALUE_FIELDS
            )
            if populated >= 2:
                output.append(FinancialPeriod(**row))

        return output[: (5 if period_type == "annual" else 12)]

    def normalize_frames(
        self,
        *,
        ticker: str,
        frames: dict[str, pd.DataFrame],
        currency: str | None,
    ) -> YahooStatementsResult:
        symbol = market_data_service.normalize_ticker(ticker)
        annual = self._periods(
            symbol=symbol,
            income=frames.get("annual_income", pd.DataFrame()),
            balance=frames.get("annual_balance", pd.DataFrame()),
            cashflow=frames.get("annual_cashflow", pd.DataFrame()),
            period_type="annual",
            currency=currency,
        )
        quarterly = self._periods(
            symbol=symbol,
            income=frames.get("quarterly_income", pd.DataFrame()),
            balance=frames.get("quarterly_balance", pd.DataFrame()),
            cashflow=frames.get("quarterly_cashflow", pd.DataFrame()),
            period_type="quarterly",
            currency=currency,
        )
        return YahooStatementsResult(
            ticker=ticker.strip().upper(),
            normalized_symbol=symbol,
            currency=currency,
            annual=annual,
            quarterly=quarterly,
        )

    async def get_financials(
        self,
        ticker: str,
        currency: str | None = None,
        *,
        force_refresh: bool = False,
    ) -> YahooStatementsResult:
        symbol = market_data_service.normalize_ticker(ticker)
        cached = self._cache.get(symbol)
        now = monotonic()

        if (
            not force_refresh
            and cached is not None
            and now - cached[0]
            < (
                self.cache_ttl_seconds
                if cached[1].annual or cached[1].quarterly
                else self.failed_ttl_seconds
            )
        ):
            return cached[1]

        async with self._lock_for(symbol):
            cached = self._cache.get(symbol)
            now = monotonic()
            if (
                not force_refresh
                and cached is not None
                and now - cached[0]
                < (
                    self.cache_ttl_seconds
                    if cached[1].annual or cached[1].quarterly
                    else self.failed_ttl_seconds
                )
            ):
                return cached[1]

            try:
                async with asyncio.timeout(
                    self.request_timeout_seconds
                ):
                    frames, fetched_currency, errors = await asyncio.to_thread(
                        self._fetch_sync, symbol
                    )
                result = self.normalize_frames(
                    ticker=ticker,
                    frames=frames,
                    currency=currency or fetched_currency,
                )
                result.error = " · ".join(errors) if errors else None
                if (
                    not result.annual
                    and not result.quarterly
                    and result.error is None
                ):
                    result.error = (
                        "Yahoo returned no structured financial statements."
                    )
            except TimeoutError:
                result = YahooStatementsResult(
                    ticker=ticker.strip().upper(),
                    normalized_symbol=symbol,
                    currency=currency,
                    annual=[],
                    quarterly=[],
                    error="Yahoo structured statements timed out.",
                )
            except Exception as exc:  # noqa: BLE001
                result = YahooStatementsResult(
                    ticker=ticker.strip().upper(),
                    normalized_symbol=symbol,
                    currency=currency,
                    annual=[],
                    quarterly=[],
                    error=f"{type(exc).__name__}: {exc}",
                )

            self._cache[symbol] = (monotonic(), result)
            return result

    async def diagnostics(
        self,
        ticker: str,
        currency: str | None = None,
        *,
        force_refresh: bool = False,
    ) -> YahooStatementsDiagnostics:
        result = await self.get_financials(
            ticker,
            currency,
            force_refresh=force_refresh,
        )
        periods = result.annual + result.quarterly
        populated_fields = sum(
            1
            for period in periods
            for field in VALUE_FIELDS
            if getattr(period, field) is not None
        )
        calculated_fields = sum(
            len(period.calculated_fields) for period in periods
        )
        return YahooStatementsDiagnostics(
            ticker=ticker.strip().upper(),
            normalized_symbol=result.normalized_symbol,
            status=(
                "available"
                if populated_fields >= 20
                else "partial"
                if periods
                else "unavailable"
            ),
            annual_periods=len(result.annual),
            quarterly_periods=len(result.quarterly),
            populated_fields=populated_fields,
            calculated_fields=calculated_fields,
            currency=result.currency,
            error=result.error,
            generated_at=datetime.now(UTC),
        )


yahoo_statements_service = YahooStatementsService()
