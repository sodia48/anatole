from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.core.resilience import AsyncStaleCache, shared_http_client


VALET_URL = "https://www.bankofcanada.ca/valet/observations/{series}/json"
VALET_SERIES = {
    # Legacy CANSIM identifiers retained as stable internal keys. Valet's
    # current public catalogue exposes the same official benchmark yields
    # under the BD.CDN.* identifiers below.
    "V39051": "BD.CDN.2YR.DQ.YLD",
    "V39055": "BD.CDN.10YR.DQ.YLD",
}


class BankOfCanadaValetService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, dict[str, list[tuple[int, float]]]] = AsyncStaleCache(max_entries=4)

    async def _load(self) -> dict[str, list[tuple[int, float]]]:
        output: dict[str, list[tuple[int, float]]] = {"V39051": [], "V39055": []}
        async def load_series(alias: str, series: str) -> tuple[str, str, dict[str, object]]:
            payload = await shared_http_client.get_json(
                VALET_URL.format(series=series), params={"recent": 260}, attempts=2,
            )
            return alias, series, payload

        payloads = await asyncio.gather(*(load_series(alias, series) for alias, series in VALET_SERIES.items()))
        for alias, series, payload in payloads:
            for observation in payload.get("observations") or []:
                raw = observation.get(series)
                if not isinstance(raw, dict):
                    continue
                try:
                    timestamp = int(datetime.fromisoformat(str(observation["d"])).replace(tzinfo=UTC).timestamp())
                    output[alias].append((timestamp, float(raw["v"])))
                except (KeyError, TypeError, ValueError):
                    continue
        if not any(output.values()):
            raise RuntimeError("Bank of Canada Valet returned no usable observations")
        return output

    async def yields(self) -> dict[str, list[tuple[int, float]]]:
        return await self._cache.get_or_load(
            "terminal-rates",
            self._load,
            fresh_seconds=900,
            stale_seconds=86_400,
        )


bank_of_canada_valet_service = BankOfCanadaValetService()
