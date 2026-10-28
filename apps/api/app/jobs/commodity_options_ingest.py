"""Scheduled ingestion of licensed commodity option chains.

Run separately from the web process: python -m app.jobs.commodity_options_ingest
No network access occurs unless an operator explicitly confirms the rights and
provides a Barchart key and a shared Redis store.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import UTC, date, datetime
from time import monotonic
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.resilience import shared_http_client
from app.schemas.options import OptionChainSnapshot, OptionContract, OptionSourceStatus
from app.services.commodity_option_snapshots import CommodityOptionSnapshots, commodity_option_snapshots
from app.services.options import _BARCHART_BASE, _COMMODITIES, _barchart_contract, _commodity_analytics

logger = logging.getLogger(__name__)
PRELOAD_ROOTS = ("GC", "RB", "CL", "NG", "SI", "HG", "ZC", "ZS")
MAX_ROWS = 5000


def normalize(root: str, payload: dict[str, Any]) -> OptionChainSnapshot:
    status = payload.get("status")
    if not isinstance(status, dict) or str(status.get("code")) != "200":
        raise ValueError("provider returned a non-success status")
    rows = payload.get("results")
    if not isinstance(rows, list) or not rows:
        raise ValueError("provider returned no contracts")
    contracts: list[OptionContract] = []
    quote_dates: set[str] = set()
    rejected = 0
    seen: set[str] = set()
    for raw in rows[:MAX_ROWS]:
        if not isinstance(raw, dict) or not (raw.get("longSymbol") or raw.get("symbol") or raw.get("legacySymbol")):
            rejected += 1
            continue
        if raw.get("root") and str(raw["root"]).upper() != root:
            rejected += 1
            continue
        try:
            parsed = _barchart_contract(raw, market="commodities", fallback_underlying=root)
            if parsed is None:
                raise ValueError("incomplete contract")
            # The legacy converter guesses the unit for small IV values. Until the
            # licensed feed's unit is confirmed, do not publish a guessed Greek.
            parsed.implied_volatility = None
            expiry = date.fromisoformat(parsed.expiration)
            if expiry < datetime.now(ZoneInfo("America/Chicago")).date():
                raise ValueError("expired contract")
            for field in ("strike", "bid", "ask", "last", "change", "percent_change", "implied_volatility", "delta", "gamma", "theta", "vega"):
                value = getattr(parsed, field)
                if value is not None and not math.isfinite(value):
                    raise ValueError("non-finite value")
            if any(value is not None and value < 0 for value in (parsed.volume, parsed.open_interest)):
                raise ValueError("negative activity")
            key = parsed.symbol
            if key in seen:
                rejected += 1
                continue
            seen.add(key)
            contracts.append(parsed)
            try:
                quote_dates.add(date.fromisoformat(str(raw.get("date") or "")).isoformat())
            except ValueError:
                pass
        except (ValueError, TypeError, OverflowError):
            rejected += 1
    if not contracts:
        raise ValueError("no validated contracts")
    if rejected > len(contracts):
        raise ValueError("most provider rows could not be validated")
    catalog = {key: (name, category, exchange) for key, name, category, exchange in _COMMODITIES}
    name, category, exchange = catalog.get(root, (root, "Custom futures root", "Provider"))
    dates = f"Dates fournisseur : {min(quote_dates)} à {max(quote_dates)}." if quote_dates else "Date des cotations non fournie."
    detail = (f"{len(contracts)} contrats validés, {rejected} lignes écartées. "
              f"Couverture non vérifiée ; données différées ; unité de volatilité non confirmée. {dates}")
    if len(rows) > MAX_ROWS:
        detail += f" Lecture limitée aux {MAX_ROWS} premières lignes sur {len(rows)}."
    return OptionChainSnapshot(
        market="commodities", symbol=root, provider_symbol=root, name=name, category=category,
        exchange=exchange, contracts=contracts, expirations=sorted({item.expiration for item in contracts}),
        analytics=_commodity_analytics(contracts),
        source_statuses=[OptionSourceStatus(source="Barchart OnDemand", status="partial", detail=detail)],
        generated_at=datetime.now(UTC), source_observation_date=min(quote_dates) if quote_dates else None,
        refresh_after_seconds=settings.commodity_options_refresh_seconds,
    )


async def fetch_barchart(root: str) -> dict[str, Any]:
    # POST keeps the API key out of URLs, access logs and exception messages.
    response = await shared_http_client.request(
        "POST", f"{_BARCHART_BASE}/getFuturesOptions.json", attempts=1,
        data={"apikey": settings.barchart_api_key, "root": root,
              "fields": "bid,ask,openInterest"},
    )
    if len(response.content) > 20_000_000:
        raise ValueError("provider response too large")
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("invalid provider response")
    return payload


async def ingest(roots: tuple[str, ...] = PRELOAD_ROOTS, *,
                 store: CommodityOptionSnapshots = commodity_option_snapshots) -> dict[str, str]:
    if not settings.commodity_options_barchart_authorized or not settings.barchart_api_key:
        raise RuntimeError("Barchart collection requires verified rights and a configured key")
    token = await store.acquire()
    if token is None:
        logger.info("commodity_ingest outcome=already_running")
        return {root: "already_running" for root in roots}
    outcomes: dict[str, str] = {}
    try:
        for root in roots:
            started = monotonic()
            try:
                payload = await fetch_barchart(root)
                fetched = monotonic()
                snapshot = normalize(root, payload)
                parsed = monotonic()
                previous, state = await store.read(root)
                if state in {"unavailable", "local_stale", "unconfigured"}:
                    raise RuntimeError("cannot verify the previous snapshot")
                if previous and len(previous.contracts) >= 40 and len(snapshot.contracts) < len(previous.contracts) // 2:
                    raise ValueError("suspicious drop in contract coverage")
                await store.write(root, snapshot, token=token)
                outcomes[root] = "updated"
                logger.info("commodity_ingest root=%s outcome=updated contracts=%d provider_ms=%.1f parse_ms=%.1f total_ms=%.1f",
                            root, len(snapshot.contracts), (fetched - started) * 1000,
                            (parsed - fetched) * 1000, (monotonic() - started) * 1000)
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001
                outcomes[root] = "failed"
                logger.warning("commodity_ingest root=%s outcome=failed category=%s duration_ms=%.1f",
                               root, type(error).__name__, (monotonic() - started) * 1000)
    finally:
        await store.release(token)
    return outcomes


async def main() -> None:
    try:
        outcomes = await ingest()
        if any(value != "updated" for value in outcomes.values()):
            raise SystemExit("Commodity ingestion incomplete; last-good snapshots were retained.")
    finally:
        await shared_http_client.close()
        await commodity_option_snapshots.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
