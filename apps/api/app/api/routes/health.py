from datetime import UTC, datetime

from fastapi import APIRouter

from app.core.resilience import shared_http_client

router = APIRouter()


@router.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    # Liveness locale uniquement : aucune base externe, aucun appel Yahoo.
    # Render exige une réponse en moins de cinq secondes.
    return {
        "status": "ok",
        "service": "anatole-api",
        "time": datetime.now(UTC).isoformat(),
    }


@router.get("/ready", include_in_schema=False)
async def ready() -> dict[str, object]:
    # Le client peut être initialisé paresseusement si un test appelle la route
    # sans exécuter le lifespan complet.
    await shared_http_client.start()
    return {
        "status": "ready",
        "http_pool_started": shared_http_client.started,
        "upstream_metrics": shared_http_client.metrics.as_dict(),
    }
