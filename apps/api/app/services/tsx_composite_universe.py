from __future__ import annotations

import asyncio
import csv
import io
from dataclasses import dataclass
from datetime import datetime
from time import monotonic

from app.core.resilience import shared_http_client


XIC_HOLDINGS_URL = (
    "https://www.blackrock.com/ca/investors/en/products/239837/"
    "ishares-sptsx-capped-composite-index-etf/"
    "1464253357814.ajax"
)
XIC_UNIVERSE_SOURCE = "BlackRock XIC holdings"


@dataclass(frozen=True, slots=True)
class CompositeConstituent:
    ticker: str
    name: str
    sector: str | None = None
    weight: float | None = None
    isin: str | None = None
    exchange: str | None = None
    currency: str | None = None


class TSXCompositeUniverseService:
    """Univers opérationnel du S&P/TSX Composite.

    BlackRock publie quotidiennement les positions de XIC, un fonds qui
    réplique le S&P/TSX Capped Composite. Les espèces et dérivés sont exclus.
    La dernière liste valide reste disponible si la source est temporairement
    inaccessible.
    """

    cache_ttl_seconds = 21_600

    def __init__(self) -> None:
        self._cache: tuple[
            float,
            list[CompositeConstituent],
        ] | None = None
        self._lock = asyncio.Lock()
        self.as_of: str | None = None

    @staticmethod
    def normalize_ticker(value: str) -> str:
        ticker = value.strip().upper()
        return ticker.replace("/", ".")

    @staticmethod
    def _number(value: str) -> float | None:
        cleaned = value.strip().replace("%", "").replace(",", "")
        if not cleaned or cleaned in {"-", "—"}:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None

    @staticmethod
    def _find_header(rows: list[list[str]]) -> int:
        for index, row in enumerate(rows):
            normalized = {cell.strip().lower() for cell in row}
            if {"ticker", "name", "sector"}.issubset(normalized):
                return index
        raise RuntimeError("BlackRock holdings header was not found")

    @staticmethod
    def _parse_as_of(rows: list[list[str]], header_index: int) -> str | None:
        for row in rows[:header_index]:
            if not row:
                continue
            label = row[0].strip().lower()
            if "holdings as of" not in label:
                continue
            raw = row[1].strip() if len(row) > 1 else ""
            if not raw:
                return None
            for pattern in ("%b %d, %Y", "%Y-%m-%d", "%d-%b-%Y"):
                try:
                    return datetime.strptime(raw, pattern).date().isoformat()
                except ValueError:
                    continue
            return raw
        return None

    def _parse(
        self,
        content: bytes,
    ) -> tuple[list[CompositeConstituent], str | None]:
        text = content.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
        header_index = self._find_header(rows)
        as_of = self._parse_as_of(rows, header_index)
        header = [cell.strip() for cell in rows[header_index]]
        indexes = {name.lower(): index for index, name in enumerate(header)}

        def cell(row: list[str], *names: str) -> str:
            for name in names:
                index = indexes.get(name.lower())
                if index is not None and index < len(row):
                    return row[index].strip()
            return ""

        output: list[CompositeConstituent] = []
        seen: set[str] = set()

        for row in rows[header_index + 1 :]:
            ticker = self.normalize_ticker(cell(row, "Ticker"))
            name = cell(row, "Name")
            sector = cell(row, "Sector") or None
            exchange = cell(row, "Exchange") or None
            currency = cell(row, "Currency") or None
            location = cell(row, "Location of Risk", "Location")
            isin = cell(row, "ISIN") or None
            weight = self._number(cell(row, "Weight (%)", "Weight"))

            if (
                not ticker
                or not name
                or ticker in {"CAD", "USD", "CASH"}
                or "CASH" in name.upper()
                or "FUTURE" in name.upper()
                or "DERIVATIVE" in name.upper()
            ):
                continue

            if location and "CANADA" not in location.upper():
                continue
            if ticker in seen:
                continue

            seen.add(ticker)
            output.append(
                CompositeConstituent(
                    ticker=ticker,
                    name=name,
                    sector=sector,
                    weight=weight,
                    isin=isin,
                    exchange=exchange,
                    currency=currency,
                )
            )

        if len(output) < 150:
            raise RuntimeError("Composite holdings response is incomplete")

        return (
            sorted(
                output,
                key=lambda item: item.weight or 0,
                reverse=True,
            ),
            as_of,
        )

    async def get_constituents(self) -> list[CompositeConstituent]:
        now = monotonic()
        if (
            self._cache is not None
            and now - self._cache[0] < self.cache_ttl_seconds
        ):
            return self._cache[1]

        async with self._lock:
            now = monotonic()
            if (
                self._cache is not None
                and now - self._cache[0] < self.cache_ttl_seconds
            ):
                return self._cache[1]

            params = {
                "dataType": "fund",
                "fileName": "XIC_holdings",
                "fileType": "csv",
            }
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 Anatole/1.0 "
                    "tsx-composite-universe"
                ),
                "Accept": "text/csv,*/*",
            }

            try:
                response = await shared_http_client.request(
                    "GET",
                    XIC_HOLDINGS_URL,
                    params=params,
                    headers=headers,
                    attempts=2,
                )
                constituents, as_of = self._parse(response.content)
            except Exception:  # noqa: BLE001
                if self._cache is not None:
                    return self._cache[1]
                raise

            self.as_of = as_of
            self._cache = (monotonic(), constituents)
            return constituents

    async def find(self, ticker: str) -> CompositeConstituent | None:
        normalized = self.normalize_ticker(ticker).removesuffix(".TO")

        try:
            constituents = await self.get_constituents()
        except Exception:  # noqa: BLE001
            return None

        return next(
            (item for item in constituents if item.ticker == normalized),
            None,
        )


tsx_composite_universe_service = TSXCompositeUniverseService()
