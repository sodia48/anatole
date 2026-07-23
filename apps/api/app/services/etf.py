from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Iterable

try:
    from app.schemas.discovery import (
        EtfDirectoryItem,
        EtfDirectorySnapshot,
    )
except ImportError:
    # Compatibilité avec une éventuelle séparation future des schémas.
    from app.schemas.etf import (  # type: ignore[no-redef]
        EtfDirectoryItem,
        EtfDirectorySnapshot,
    )

from app.data.etf_catalog import (
    ETF_CATALOG,
    PRIORITY_ETF_TICKERS,
    EtfCatalogEntry,
)
from app.services.market_data import market_data_service


QUOTE_REFRESH_SECONDS = 300
CLIENT_REFRESH_SECONDS = 60
QUOTE_BATCH_SIZE = 24
COLD_START_TIMEOUT_SECONDS = 12


def _model_fields(model: type[Any]) -> set[str]:
    fields = getattr(model, "model_fields", None)
    if isinstance(fields, dict):
        return set(fields)
    legacy_fields = getattr(model, "__fields__", None)
    if isinstance(legacy_fields, dict):
        return set(legacy_fields)
    return set()


def _compatible_payload(
    model: type[Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    fields = _model_fields(model)
    if not fields:
        return payload
    return {key: value for key, value in payload.items() if key in fields}


def _chunks(
    values: list[str],
    size: int,
) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


class EtfDirectoryService:
    """Répertoire ETF sectoriel avec cotations asynchrones mises en cache.

    Le catalogue est retourné immédiatement. Les cotations des ETF les plus
    consultés sont chargées lors du premier appel, puis le reste du répertoire
    est rafraîchi en arrière-plan par lots afin d'éviter qu'une centaine
    d'appels Yahoo bloque la page.
    """

    def __init__(self) -> None:
        self._quote_cache: dict[str, Any] = {}
        self._last_full_refresh = 0.0
        self._refresh_task: asyncio.Task[None] | None = None
        self._cold_start_lock = asyncio.Lock()

    async def _refresh_batch(self, tickers: list[str]) -> None:
        if not tickers:
            return

        try:
            quotes = await asyncio.wait_for(
                market_data_service.get_quotes(tickers),
                timeout=18,
            )
        except (TimeoutError, Exception):
            return

        for requested_ticker, quote in zip(
            tickers,
            quotes,
            strict=False,
        ):
            # Le service de marché possède un repli de démonstration pour
            # maintenir certaines pages. Le répertoire ETF l'ignore afin de ne
            # jamais présenter une valeur synthétique comme un cours réel.
            if str(getattr(quote, "source", "")).lower() == "demo-fallback":
                continue
            self._quote_cache[requested_ticker] = quote

    async def _refresh_quotes(
        self,
        tickers: list[str],
    ) -> None:
        for batch in _chunks(tickers, QUOTE_BATCH_SIZE):
            await self._refresh_batch(batch)

    async def _refresh_all(self) -> None:
        try:
            await self._refresh_quotes(
                [entry["ticker"] for entry in ETF_CATALOG]
            )
            self._last_full_refresh = monotonic()
        finally:
            self._refresh_task = None

    def _ensure_background_refresh(self) -> None:
        stale = (
            monotonic() - self._last_full_refresh
            >= QUOTE_REFRESH_SECONDS
        )
        if not stale:
            return
        if self._refresh_task is not None and not self._refresh_task.done():
            return
        self._refresh_task = asyncio.create_task(self._refresh_all())

    async def _prime_cold_start(self) -> None:
        if self._quote_cache:
            return

        async with self._cold_start_lock:
            if self._quote_cache:
                return
            try:
                await asyncio.wait_for(
                    self._refresh_quotes(list(PRIORITY_ETF_TICKERS)),
                    timeout=COLD_START_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                # Le catalogue reste disponible; le rafraîchissement complet
                # continue ensuite en arrière-plan.
                pass

    @staticmethod
    def _make_item(
        entry: EtfCatalogEntry,
        quote: Any | None,
    ) -> Any:
        available = quote is not None
        price = float(getattr(quote, "price", 0.0) or 0.0)
        change_percent = float(
            getattr(quote, "change_percent", 0.0) or 0.0
        )
        change = float(getattr(quote, "change", 0.0) or 0.0)
        volume = int(getattr(quote, "volume", 0) or 0)

        payload: dict[str, Any] = {
            # Noms utilisés par la version actuelle.
            "ticker": entry["ticker"],
            "name": entry["name"],
            "provider": entry["provider"],
            "category": entry["category"],
            "exposure": entry["exposure"],
            "region": entry["region"],
            "price": price if available else 0.0,
            "change_percent": change_percent if available else 0.0,
            "volume": volume if available else 0,
            # Alias conservés pour les évolutions de schéma.
            "symbol": entry["ticker"],
            "issuer": entry["provider"],
            "sector": entry["category"],
            "description": entry["exposure"],
            "change": change if available else 0.0,
            "currency": str(
                getattr(quote, "currency", "CAD") or "CAD"
            ),
            "source": (
                str(getattr(quote, "source", "yahoo-public"))
                if available
                else "unavailable"
            ),
            "delayed": bool(
                getattr(quote, "delayed", True)
            ),
            "timestamp": (
                getattr(quote, "timestamp", None)
                if available
                else None
            ),
        }
        return EtfDirectoryItem(
            **_compatible_payload(EtfDirectoryItem, payload)
        )

    def _make_snapshot(self) -> Any:
        items = [
            self._make_item(
                entry,
                self._quote_cache.get(entry["ticker"]),
            )
            for entry in ETF_CATALOG
        ]
        now = datetime.now(UTC)
        payload: dict[str, Any] = {
            "items": items,
            "etfs": items,
            "total": len(items),
            "generated_at": now,
            "refresh_after_seconds": CLIENT_REFRESH_SECONDS,
            "source": (
                "Répertoire éditorial Anatole + cotations publiques"
            ),
        }
        return EtfDirectorySnapshot(
            **_compatible_payload(EtfDirectorySnapshot, payload)
        )

    async def snapshot(self) -> Any:
        await self._prime_cold_start()
        self._ensure_background_refresh()
        return self._make_snapshot()

    # Façade de compatibilité avec les noms utilisés dans les jalons précédents.
    async def get_snapshot(self) -> Any:
        return await self.snapshot()

    async def directory(self) -> Any:
        return await self.snapshot()

    async def get_directory(self) -> Any:
        return await self.snapshot()

    async def build(self) -> Any:
        return await self.snapshot()


etf_service = EtfDirectoryService()
etf_directory_service = etf_service


async def get_etf_directory() -> Any:
    return await etf_service.snapshot()


async def build_etf_directory() -> Any:
    return await etf_service.snapshot()


async def build_etf_snapshot() -> Any:
    return await etf_service.snapshot()


async def etf_directory() -> Any:
    return await etf_service.snapshot()
