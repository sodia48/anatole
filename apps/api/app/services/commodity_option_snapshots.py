"""Durable last-good commodity snapshots, independent of user requests.

Only the scheduled ingestion process writes snapshots. API requests read them
with a bounded Redis timeout and never invoke a market-data provider.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import UTC, datetime
from time import monotonic

from redis.asyncio import Redis

from app.core.config import settings
from app.core.telemetry import performance_monitor
from app.schemas.options import OptionChainSnapshot

logger = logging.getLogger(__name__)


class CommodityOptionSnapshots:
    def __init__(self, *, url: str, prefix: str, client: Redis | None = None) -> None:
        self.url = url.strip()
        self.prefix = prefix.strip(":") or "anatole:cache:v1"
        self._client = client
        self._loop: asyncio.AbstractEventLoop | None = None
        self._last_good: dict[str, OptionChainSnapshot] = {}

    def _redis(self) -> Redis | None:
        if self._client is not None and self._loop is None:
            # Explicitly injected clients are used by tests.
            return self._client
        if not self.url:
            return None
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop:
            self._client = Redis.from_url(self.url, decode_responses=False,
                                          socket_connect_timeout=0.2, socket_timeout=0.2)
            self._loop = loop
        return self._client

    def _key(self, root: str) -> str:
        return f"{self.prefix}:commodity-options:v1:{root}"

    async def read(self, root: str) -> tuple[OptionChainSnapshot | None, str]:
        started = monotonic()

        def result(value: OptionChainSnapshot | None, outcome: str) -> tuple[OptionChainSnapshot | None, str]:
            performance_monitor.record("cache", "commodity-options", outcome, duration_ms=(monotonic() - started) * 1000)
            return value, outcome

        client = self._redis()
        if client is None:
            return result(None, "unconfigured")
        try:
            async with asyncio.timeout(0.3):
                payload = await client.get(self._key(root))
            if payload is None:
                cached = self._last_good.get(root)
                return result(cached, "local_stale") if cached is not None else result(None, "miss")
            snapshot = OptionChainSnapshot.model_validate_json(payload)
            if snapshot.market != "commodities" or snapshot.symbol != root:
                raise ValueError("snapshot identity mismatch")
            self._last_good[root] = snapshot
            return result(snapshot, "hit")
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001
            logger.warning("commodity_snapshot_read root=%s outcome=error category=%s", root, type(error).__name__)
            cached = self._last_good.get(root)
            return result(cached, "local_stale") if cached is not None else result(None, "unavailable")

    async def write(self, root: str, snapshot: OptionChainSnapshot, *, token: str) -> None:
        if snapshot.market != "commodities" or snapshot.symbol != root or not snapshot.contracts:
            raise ValueError("refusing empty or mismatched commodity snapshot")
        client = self._redis()
        if client is None:
            raise RuntimeError("REDIS_URL is required for commodity ingestion")
        # The lease check and SET are atomic: an expired worker cannot replace
        # data written by a newer ingestion run.
        script = ("if redis.call('get', KEYS[1]) == ARGV[1] then "
                  "redis.call('set', KEYS[2], ARGV[2]); return 1 else return 0 end")
        async with asyncio.timeout(5):
            written = await client.eval(script, 2, f"{self.prefix}:commodity-options:v1:ingest-lock",
                                        self._key(root), token, snapshot.model_dump_json())
        if not written:
            raise RuntimeError("commodity ingestion lease expired")

    async def acquire(self, *, lease_seconds: int = 1800) -> str | None:
        client = self._redis()
        if client is None:
            raise RuntimeError("REDIS_URL is required for commodity ingestion")
        token = secrets.token_urlsafe(24)
        async with asyncio.timeout(2):
            acquired = await client.set(f"{self.prefix}:commodity-options:v1:ingest-lock", token, nx=True, ex=lease_seconds)
        return token if acquired else None

    async def release(self, token: str) -> None:
        client = self._redis()
        if client is None:
            return
        script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
        async with asyncio.timeout(2):
            await client.eval(script, 1, f"{self.prefix}:commodity-options:v1:ingest-lock", token)

    async def close(self) -> None:
        if self._client is not None and self._loop is not None:
            await self._client.aclose()
            self._client = None
            self._loop = None


def snapshot_age_seconds(snapshot: OptionChainSnapshot) -> float:
    generated = snapshot.generated_at
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=UTC)
    return max(0.0, (datetime.now(UTC) - generated).total_seconds())


commodity_option_snapshots = CommodityOptionSnapshots(
    url=settings.redis_url, prefix=settings.redis_cache_prefix,
)
