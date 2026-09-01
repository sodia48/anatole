from __future__ import annotations

import math
import statistics
from datetime import UTC, datetime
from urllib.parse import quote

from app.schemas.analysis import TerminalMarketDriver
from app.schemas.stocks import Candle


YAHOO_DRIVERS = (
    ("wti", "WTI", "Énergie", "CL=F", "USD", "$"),
    ("brent", "Brent", "Énergie", "BZ=F", "USD", "$"),
    ("gold", "Or", "Métaux", "GC=F", "USD", "$"),
    ("copper", "Cuivre", "Métaux", "HG=F", "USD", "$"),
    ("natural_gas", "Gaz naturel", "Énergie", "NG=F", "USD", "$"),
    ("cadusd", "CAD/USD", "Devises", "CADUSD=X", "USD", "taux"),
    ("sp500", "S&P 500", "Actions", "^GSPC", "points", "points"),
    ("nasdaq", "Nasdaq", "Actions", "^IXIC", "points", "points"),
    ("vix", "VIX", "Volatilité", "^VIX", "points", "points"),
)


def _change(candles: list[Candle], sessions: int) -> float | None:
    if len(candles) <= sessions or candles[-sessions - 1].close <= 0:
        return None
    return (candles[-1].close / candles[-sessions - 1].close - 1) * 100


def _returns(candles: list[Candle]) -> dict[int, float]:
    output: dict[int, float] = {}
    for previous, current in zip(candles, candles[1:], strict=False):
        if previous.close > 0:
            output[current.time // 86_400] = current.close / previous.close - 1
    return output


def correlation(left: list[Candle], right: list[Candle], sessions: int = 60) -> float | None:
    left_returns, right_returns = _returns(left), _returns(right)
    shared = sorted(set(left_returns) & set(right_returns))[-sessions:]
    if len(shared) < 20:
        return None
    x, y = [left_returns[key] for key in shared], [right_returns[key] for key in shared]
    x_mean, y_mean = statistics.fmean(x), statistics.fmean(y)
    numerator = sum((a - x_mean) * (b - y_mean) for a, b in zip(x, y, strict=False))
    denominator = math.sqrt(sum((a - x_mean) ** 2 for a in x) * sum((b - y_mean) ** 2 for b in y))
    return None if denominator <= 1e-12 else max(-1.0, min(1.0, numerator / denominator))


def relationship(value: float | None) -> str | None:
    if value is None:
        return None
    if value >= 0.7:
        return "Corrélation récente fortement positive avec le TSX"
    if value >= 0.3:
        return "Corrélation récente positive avec le TSX"
    if value <= -0.7:
        return "Corrélation récente fortement négative avec le TSX"
    if value <= -0.3:
        return "Corrélation récente négative avec le TSX"
    return "Corrélation récente faible avec le TSX"


def yahoo_market_drivers(histories: dict[str, list[Candle]], benchmark: list[Candle]) -> list[TerminalMarketDriver]:
    output: list[TerminalMarketDriver] = []
    for key, label, category, symbol, unit, _ in YAHOO_DRIVERS:
        candles = histories.get(symbol, [])
        source_url = f"https://finance.yahoo.com/quote/{quote(symbol, safe='')}"
        if len(candles) < 2:
            output.append(TerminalMarketDriver(
                key=key, label=label, category=category, unit=unit, change_unit="%",
                status="unavailable", source_name="Yahoo Finance public chart", source_url=source_url,
                delayed=True,
            ))
            continue
        value = correlation(candles, benchmark)
        output.append(TerminalMarketDriver(
            key=key, label=label, category=category, value=round(candles[-1].close, 4), unit=unit,
            change_1d=round(_change(candles, 1), 3) if _change(candles, 1) is not None else None,
            change_5d=round(_change(candles, 5), 3) if _change(candles, 5) is not None else None,
            change_20d=round(_change(candles, 20), 3) if _change(candles, 20) is not None else None,
            change_unit="%", correlation_60d_to_tsx=round(value, 3) if value is not None else None,
            relationship_label=relationship(value), status="available", source_name="Yahoo Finance public chart",
            source_url=source_url, delayed=True, as_of=datetime.fromtimestamp(candles[-1].time, UTC),
        ))
    return output


def rate_market_drivers(series: dict[str, list[tuple[int, float]]] | None) -> list[TerminalMarketDriver]:
    definitions = (
        ("canada_2y", "Canada 2 ans", "V39051", "BD.CDN.2YR.DQ.YLD"),
        ("canada_10y", "Canada 10 ans", "V39055", "BD.CDN.10YR.DQ.YLD"),
    )
    output: list[TerminalMarketDriver] = []
    for key, label, series_key, active_series in definitions:
        points = (series or {}).get(series_key, [])
        source_url = f"https://www.bankofcanada.ca/valet/observations/{active_series}/json"
        if len(points) < 2:
            output.append(TerminalMarketDriver(
                key=key, label=label, category="Taux", unit="%", change_unit="bps", status="unavailable",
                source_name="Banque du Canada / Bank of Canada", source_url=source_url, delayed=True,
            ))
            continue
        def change(index: int) -> float | None:
            return None if len(points) <= index else (points[-1][1] - points[-index - 1][1]) * 100
        output.append(TerminalMarketDriver(
            key=key, label=label, category="Taux", value=round(points[-1][1], 4), unit="%",
            change_1d=round(change(1), 1) if change(1) is not None else None,
            change_5d=round(change(5), 1) if change(5) is not None else None,
            change_20d=round(change(20), 1) if change(20) is not None else None,
            change_unit="bps", correlation_60d_to_tsx=None, relationship_label=None, status="available",
            source_name="Banque du Canada / Bank of Canada", source_url=source_url, delayed=True,
            as_of=datetime.fromtimestamp(points[-1][0], UTC),
        ))
    return output
