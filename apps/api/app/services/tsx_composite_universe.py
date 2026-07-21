from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from time import monotonic

import httpx


XIC_HOLDINGS_URL = (
    "https://www.blackrock.com/ca/investors/en/products/239837/"
    "ishares-sptsx-capped-composite-index-etf/"
    "1464253357814.ajax"
)


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
    """
    Univers machine-readable du marché canadien.

    BlackRock publie quotidiennement les positions de XIC, un fonds qui
    réplique le S&P/TSX Capped Composite. Après exclusion des espèces et
    dérivés, cette liste sert de registre opérationnel des sociétés à
    couvrir. Le moteur financier reste compatible avec tout ticker TSX,
    même lorsqu'il n'apparaît pas encore dans ce registre.
    """

    cache_ttl_seconds = 21_600

    def __init__(self) -> None:
        self._cache: tuple[
            float,
            list[CompositeConstituent],
        ] | None = None

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
    def _find_header(
        rows: list[list[str]],
    ) -> int:
        for index, row in enumerate(rows):
            normalized = {
                cell.strip().lower()
                for cell in row
            }
            if {"ticker", "name", "sector"}.issubset(normalized):
                return index
        raise RuntimeError(
            "BlackRock holdings header was not found"
        )

    def _parse(
        self,
        content: bytes,
    ) -> list[CompositeConstituent]:
        text = content.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
        header_index = self._find_header(rows)
        header = [
            cell.strip()
            for cell in rows[header_index]
        ]
        indexes = {
            name.lower(): index
            for index, name in enumerate(header)
        }

        def cell(row: list[str], *names: str) -> str:
            for name in names:
                index = indexes.get(name.lower())
                if index is not None and index < len(row):
                    return row[index].strip()
            return ""

        output: list[CompositeConstituent] = []
        seen: set[str] = set()

        for row in rows[header_index + 1 :]:
            ticker = self.normalize_ticker(
                cell(row, "Ticker")
            )
            name = cell(row, "Name")
            sector = cell(row, "Sector") or None
            exchange = cell(row, "Exchange") or None
            currency = cell(row, "Currency") or None
            location = cell(
                row,
                "Location of Risk",
                "Location",
            )
            isin = cell(row, "ISIN") or None
            weight = self._number(
                cell(row, "Weight (%)", "Weight")
            )

            if (
                not ticker
                or not name
                or ticker in {"CAD", "USD", "CASH"}
                or "CASH" in name.upper()
                or "FUTURE" in name.upper()
                or "DERIVATIVE" in name.upper()
            ):
                continue

            # Les positions actions de XIC sont canadiennes et négociées
            # principalement à Toronto. Ce filtre évite les reliquats.
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
            raise RuntimeError(
                "Composite holdings response is incomplete"
            )

        return sorted(
            output,
            key=lambda item: item.weight or 0,
            reverse=True,
        )

    async def get_constituents(
        self,
    ) -> list[CompositeConstituent]:
        now = monotonic()

        if (
            self._cache is not None
            and now - self._cache[0]
            < self.cache_ttl_seconds
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
                "official-financials-engine"
            ),
            "Accept": "text/csv,*/*",
        }

        async with httpx.AsyncClient(
            timeout=20.0,
            headers=headers,
            follow_redirects=True,
        ) as client:
            response = await client.get(
                XIC_HOLDINGS_URL,
                params=params,
            )
            response.raise_for_status()
            constituents = self._parse(response.content)

        self._cache = (monotonic(), constituents)
        return constituents

    async def find(
        self,
        ticker: str,
    ) -> CompositeConstituent | None:
        normalized = self.normalize_ticker(ticker)
        normalized = normalized.removesuffix(".TO")

        try:
            constituents = await self.get_constituents()
        except Exception:  # noqa: BLE001
            return None

        return next(
            (
                item
                for item in constituents
                if item.ticker == normalized
            ),
            None,
        )


tsx_composite_universe_service = (
    TSXCompositeUniverseService()
)
