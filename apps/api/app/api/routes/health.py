from datetime import UTC, datetime

from fastapi import APIRouter

from app.core.resilience import shared_http_client

router = APIRouter()


@router.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    timestamp = datetime.now(UTC).isoformat()
    return {
        "status": "ok",
        "service": "anatole-api",
        "timestamp": timestamp,
        "time": timestamp,
    }


@router.get("/ready", include_in_schema=False)
async def ready() -> dict[str, object]:
    await shared_http_client.start()
    return {
        "status": "ready",
        "http_pool_started": shared_http_client.started,
        "upstream_metrics": shared_http_client.metrics.as_dict(),
    }
