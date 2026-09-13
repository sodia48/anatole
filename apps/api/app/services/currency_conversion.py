from __future__ import annotations

import asyncio
import logging
from bisect import bisect_right
from typing import Iterable

from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.fundamentals import FundamentalSnapshot
from app.schemas.stocks import Candle, Quote

logger = logging.getLogger(__name__)

YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart"
BOC_VALET = "https://www.bankofcanada.ca/valet/observations/{series}/json"

QUOTE_MONEY_FIELDS = (
    "market_cap",
    "enterprise_value",
    "fifty_two_week_high",
    "fifty_two_week_low",
    "dividend_rate",
)

FINANCIAL_MONEY_FIELDS = (
    "trailing_eps",
    "forward_eps",
    "total_revenue",
    "revenue_per_share",
    "gross_profit",
    "ebitda",
    "net_income_to_common",
    "free_cash_flow",
    "operating_cash_flow",
    "total_cash",
    "total_debt",
)

PERIOD_MONEY_FIELDS = (
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

TTM_MONEY_FIELDS = (
    "total_revenue",
    "gross_profit",
    "operating_income",
    "ebitda",
    "net_income",
    "diluted_eps",
    "operating_cash_flow",
    "capital_expenditure",
    "free_cash_flow",
    "dividends_paid",
    "share_repurchases",
    "total_cash",
    "total_debt",
    "net_debt",
)

ANALYST_MONEY_FIELDS = (
    "target_low",
    "target_mean",
    "target_median",
    "target_high",
    "current_price",
)

EARNINGS_HISTORY_MONEY_FIELDS = ("actual", "estimate")
EARNINGS_ESTIMATE_MONEY_FIELDS = (
    "eps_average",
    "eps_low",
    "eps_high",
    "eps_year_ago",
    "revenue_average",
    "revenue_low",
    "revenue_high",
    "revenue_year_ago",
)


def _clean_currency(value: str | None) -> tuple[str | None, float]:
    raw = str(value or "").strip()
    if not raw:
        return None, 1.0
    upper = raw.upper()
    if upper in {"CAD", "CDN", "C$"}:
        return "CAD", 1.0
    if upper in {"USD", "US$", "$US"}:
        return "USD", 1.0
    if upper in {"GBX", "GBPENCE", "GBP PENCE"} or raw == "GBp":
        return "GBP", 0.01
    return upper, 1.0


def _is_non_monetary_symbol(symbol: str) -> bool:
    value = symbol.strip().upper()
    return value.startswith("^") or value.endswith("=X")


def _multiply(value: float | None, rate: float | None) -> float | None:
    if value is None or rate is None:
        return value
    return round(float(value) * rate, 8)


class CurrencyConversionService:
    # CAD is Anatole's display currency. Native/source currencies are kept
    # as metadata. Index points and FX ratios are not monetary amounts.
    def __init__(self) -> None:
        self._spot_cache: AsyncStaleCache[str, float] = AsyncStaleCache(
            max_entries=32
        )
        self._history_cache: AsyncStaleCache[
            str, list[tuple[int, float]]
        ] = AsyncStaleCache(max_entries=32)

    async def _yahoo_pair(
        self,
        base: str,
        *,
        history: bool,
    ) -> tuple[list[tuple[int, float]], float | None]:
        direct = f"{base}CAD=X"
        payload = await shared_http_client.get_json(
            f"{YAHOO_CHART}/{direct}",
            attempts=2,
            params={
                "range": "max" if history else "5d",
                "interval": "1d",
                "includePrePost": "false",
                "events": "div,splits",
            },
        )
        rows = payload.get("chart", {}).get("result") or []
        if not rows:
            raise RuntimeError(f"FX Yahoo vide pour {direct}")
        result = rows[0]
        meta = result.get("meta") or {}
        timestamps = result.get("timestamp") or []
        quote = (((result.get("indicators") or {}).get("quote") or [{}])[0])
        closes = quote.get("close") or []
        points: list[tuple[int, float]] = []
        for index, timestamp in enumerate(timestamps):
            try:
                value = closes[index]
                if value is None or float(value) <= 0:
                    continue
                points.append((int(timestamp), float(value)))
            except (IndexError, TypeError, ValueError):
                continue
        spot = None
        for key in ("regularMarketPrice", "chartPreviousClose"):
            try:
                candidate = float(meta.get(key))
            except (TypeError, ValueError):
                continue
            if candidate > 0:
                spot = candidate
                break
        if spot is None and points:
            spot = points[-1][1]
        return points, spot

    async def _yahoo_inverse(
        self,
        base: str,
        *,
        history: bool,
    ) -> tuple[list[tuple[int, float]], float | None]:
        inverse = f"CAD{base}=X"
        payload = await shared_http_client.get_json(
            f"{YAHOO_CHART}/{inverse}",
            attempts=2,
            params={
                "range": "max" if history else "5d",
                "interval": "1d",
                "includePrePost": "false",
                "events": "div,splits",
            },
        )
        rows = payload.get("chart", {}).get("result") or []
        if not rows:
            raise RuntimeError(f"FX Yahoo vide pour {inverse}")
        result = rows[0]
        timestamps = result.get("timestamp") or []
        quote = (((result.get("indicators") or {}).get("quote") or [{}])[0])
        closes = quote.get("close") or []
        points: list[tuple[int, float]] = []
        for index, timestamp in enumerate(timestamps):
            try:
                value = float(closes[index])
            except (IndexError, TypeError, ValueError):
                continue
            if value > 0:
                points.append((int(timestamp), 1.0 / value))
        meta = result.get("meta") or {}
        spot = None
        for key in ("regularMarketPrice", "chartPreviousClose"):
            try:
                value = float(meta.get(key))
            except (TypeError, ValueError):
                continue
            if value > 0:
                spot = 1.0 / value
                break
        if spot is None and points:
            spot = points[-1][1]
        return points, spot

    async def _bank_of_canada_spot(self, base: str) -> float:
        series = f"FX{base}CAD"
        payload = await shared_http_client.get_json(
            BOC_VALET.format(series=series),
            attempts=2,
            params={"recent": 10},
        )
        observations = payload.get("observations") or []
        for observation in reversed(observations):
            raw = observation.get(series)
            if not isinstance(raw, dict):
                continue
            try:
                value = float(raw.get("v"))
            except (TypeError, ValueError):
                continue
            if value > 0:
                return value
        raise RuntimeError(f"Banque du Canada: {series} indisponible")

    async def _load_spot(self, base: str) -> float:
        try:
            _points, value = await self._yahoo_pair(base, history=False)
            if value is not None and value > 0:
                return value
        except Exception as error:
            logger.info(
                "cad_fx_yahoo_direct_unavailable currency=%s error=%s",
                base,
                type(error).__name__,
            )
        try:
            _points, value = await self._yahoo_inverse(base, history=False)
            if value is not None and value > 0:
                return value
        except Exception as error:
            logger.info(
                "cad_fx_yahoo_inverse_unavailable currency=%s error=%s",
                base,
                type(error).__name__,
            )
        return await self._bank_of_canada_spot(base)

    async def rate_to_cad(self, currency: str | None) -> float | None:
        base, unit_scale = _clean_currency(currency)
        if base is None:
            return None
        if base == "CAD":
            return unit_scale
        if base in {"FX", "PTS", "POINTS"}:
            return None
        try:
            value = await self._spot_cache.get_or_load(
                base,
                lambda: self._load_spot(base),
                fresh_seconds=900,
                stale_seconds=86_400,
            )
        except Exception as error:
            logger.warning(
                "cad_fx_spot_unavailable currency=%s error=%s detail=%s",
                base,
                type(error).__name__,
                error,
            )
            return None
        return value * unit_scale

    async def _load_history(self, base: str) -> list[tuple[int, float]]:
        for loader in (self._yahoo_pair, self._yahoo_inverse):
            try:
                points, _spot = await loader(base, history=True)
                if points:
                    return sorted(points)
            except Exception as error:
                logger.info(
                    "cad_fx_history_path_unavailable currency=%s error=%s",
                    base,
                    type(error).__name__,
                )
        raise RuntimeError(f"Historique FX {base}/CAD indisponible")

    async def rates_to_cad(
        self,
        currency: str | None,
        timestamps: Iterable[int],
    ) -> dict[int, float] | None:
        requested = [int(value) for value in timestamps]
        if not requested:
            return {}
        base, unit_scale = _clean_currency(currency)
        if base is None:
            return None
        if base == "CAD":
            return {timestamp: unit_scale for timestamp in requested}
        try:
            points = await self._history_cache.get_or_load(
                base,
                lambda: self._load_history(base),
                fresh_seconds=21_600,
                stale_seconds=604_800,
            )
        except Exception:
            spot = await self.rate_to_cad(currency)
            if spot is None:
                return None
            return {timestamp: spot for timestamp in requested}

        keys = [item[0] for item in points]
        values = [item[1] for item in points]
        spot: float | None = None
        result: dict[int, float] = {}
        for timestamp in requested:
            index = bisect_right(keys, timestamp) - 1
            if index >= 0:
                result[timestamp] = values[index] * unit_scale
                continue
            if spot is None:
                spot = await self.rate_to_cad(currency)
            if spot is None:
                return None
            result[timestamp] = spot
        return result

    async def quote_to_cad(self, quote: Quote) -> Quote:
        native_currency = quote.native_currency or quote.currency
        if quote.ticker.startswith("^"):
            return quote.model_copy(
                update={
                    "currency": "PTS",
                    "native_currency": native_currency,
                    "fx_rate_to_cad": None,
                }
            )
        if quote.ticker.endswith("=X"):
            return quote.model_copy(
                update={
                    "currency": "FX",
                    "native_currency": native_currency,
                    "fx_rate_to_cad": None,
                }
            )

        rate = await self.rate_to_cad(native_currency)
        if rate is None:
            return quote.model_copy(
                update={"native_currency": native_currency}
            )
        return quote.model_copy(
            update={
                "currency": "CAD",
                "native_currency": native_currency,
                "fx_rate_to_cad": rate,
                "price": _multiply(quote.price, rate),
                "previous_close": _multiply(quote.previous_close, rate),
                "change": _multiply(quote.change, rate),
                "day_high": _multiply(quote.day_high, rate),
                "day_low": _multiply(quote.day_low, rate),
            }
        )

    async def candles_to_cad(
        self,
        symbol: str,
        currency: str | None,
        candles: list[Candle],
    ) -> list[Candle]:
        if not candles or _is_non_monetary_symbol(symbol):
            return candles
        base, _scale = _clean_currency(currency)
        if base == "CAD":
            return candles
        rates = await self.rates_to_cad(
            currency,
            (candle.time for candle in candles),
        )
        if rates is None:
            return candles
        return [
            candle.model_copy(
                update={
                    "open": _multiply(candle.open, rates[candle.time]),
                    "high": _multiply(candle.high, rates[candle.time]),
                    "low": _multiply(candle.low, rates[candle.time]),
                    "close": _multiply(candle.close, rates[candle.time]),
                }
            )
            for candle in candles
        ]

    @staticmethod
    def _convert_fields(obj, fields: Iterable[str], rate: float | None) -> None:
        if rate is None:
            return
        for field in fields:
            value = getattr(obj, field, None)
            if value is not None:
                setattr(obj, field, _multiply(value, rate))

    async def fundamental_to_cad(
        self,
        snapshot: FundamentalSnapshot,
    ) -> FundamentalSnapshot:
        result = snapshot.model_copy(deep=True)
        quote_currency = result.native_currency or result.currency
        financial_currency = (
            result.native_financial_currency
            or result.financial_currency
            or quote_currency
        )
        result.native_currency = quote_currency
        result.native_financial_currency = financial_currency

        if quote_currency is None and financial_currency is None:
            return result

        quote_rate, financial_rate = await asyncio.gather(
            self.rate_to_cad(quote_currency),
            self.rate_to_cad(financial_currency),
        )

        if quote_rate is not None:
            self._convert_fields(
                result.metrics,
                QUOTE_MONEY_FIELDS,
                quote_rate,
            )
            self._convert_fields(
                result.analysts,
                ANALYST_MONEY_FIELDS,
                quote_rate,
            )
            result.currency = "CAD"
            result.fx_rate_to_cad = quote_rate

        if financial_rate is not None:
            self._convert_fields(
                result.metrics,
                FINANCIAL_MONEY_FIELDS,
                financial_rate,
            )
            for row in result.annual_financials + result.quarterly_financials:
                row_rate = await self.rate_to_cad(
                    row.currency or financial_currency
                )
                if row_rate is None:
                    continue
                self._convert_fields(row, PERIOD_MONEY_FIELDS, row_rate)
                row.currency = "CAD"
            self._convert_fields(
                result.ttm,
                TTM_MONEY_FIELDS,
                financial_rate,
            )
            if result.ttm.currency is not None:
                result.ttm.currency = "CAD"
            for row in result.earnings_history:
                self._convert_fields(
                    row,
                    EARNINGS_HISTORY_MONEY_FIELDS,
                    financial_rate,
                )
            for row in result.earnings_estimates:
                self._convert_fields(
                    row,
                    EARNINGS_ESTIMATE_MONEY_FIELDS,
                    financial_rate,
                )
            result.financial_currency = "CAD"
            result.financial_fx_rate_to_cad = financial_rate

        return result


currency_conversion_service = CurrencyConversionService()
