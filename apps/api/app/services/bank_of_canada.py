from __future__ import annotations

from datetime import UTC, datetime

from app.core.resilience import AsyncStaleCache, shared_http_client


VALET_URL = "https://www.bankofcanada.ca/valet/observations/V39051,V39055/json"


class BankOfCanadaValetService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, dict[str, list[tuple[int, float]]]] = AsyncStaleCache(max_entries=4)

    async def _load(self) -> dict[str, list[tuple[int, float]]]:
        payload = await shared_http_client.get_json(VALET_URL, params={"recent": 260}, attempts=2)
        output: dict[str, list[tuple[int, float]]] = {"V39051": [], "V39055": []}
        for observation in payload.get("observations") or []:
            try:
                timestamp = int(datetime.fromisoformat(str(observation["d"])).replace(tzinfo=UTC).timestamp())
            except (KeyError, TypeError, ValueError):
                continue
            for series in output:
                raw = observation.get(series)
                if not isinstance(raw, dict):
                    continue
                try:
                    output[series].append((timestamp, float(raw["v"])))
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
