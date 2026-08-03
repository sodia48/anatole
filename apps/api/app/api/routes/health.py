from datetime import UTC, datetime

from fastapi import APIRouter, Request

from app.core.config import settings
from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.services.accounts import account_service

router = APIRouter()


@router.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    timestamp = datetime.now(UTC).isoformat()
    return {
        "status": "ok",
        "service": "anatole-api",
        "version": "1.1.5",
        "timestamp": timestamp,
        "time": timestamp,
    }


@router.get("/ready", include_in_schema=False)
async def ready(request: Request) -> dict[str, object]:
    await shared_http_client.start()
    account_storage = await account_service.readiness()

    required_admin_routes = {
        "/api/v1/admin/overview",
        "/api/v1/admin/users",
        "/api/v1/admin/invites",
        "/api/v1/admin/reports",
    }
    available_routes = {
        getattr(route, "path", "")
        for route in request.app.routes
    }
    missing_admin_routes = sorted(
        required_admin_routes - available_routes
    )

    return {
        "status": "ready",
        "http_pool_started": shared_http_client.started,
        "upstream_metrics": shared_http_client.metrics.as_dict(),
        "account_storage": account_storage,
        "admin_console": {
            "status": "ready" if not missing_admin_routes else "degraded",
            "routes_enabled": not missing_admin_routes,
            "configured_admins": len(settings.account_admin_email_set),
            "missing_routes": missing_admin_routes,
        },
        "reliability": reliability_monitor.snapshot(),
    }
