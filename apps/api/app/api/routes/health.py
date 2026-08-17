from datetime import UTC, datetime

from fastapi import APIRouter, Request

from app.core.config import settings
from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.core.version import ANATOLE_VERSION
from app.services.accounts import account_service

router = APIRouter()


def _route_paths(routes: list[object]) -> set[str]:
    """Collect paths through FastAPI's nested included-router wrappers."""
    paths: set[str] = set()
    visited: set[int] = set()

    def join_path(prefix: str, path: str) -> str:
        return f"/{prefix.strip('/')}/{path.strip('/')}".replace("//", "/")

    def visit(items: list[object], prefix: str = "") -> None:
        for route in items:
            identity = id(route)
            if identity in visited:
                continue
            visited.add(identity)

            path = getattr(route, "path", None)
            if isinstance(path, str):
                paths.add(join_path(prefix, path))

            original_router = getattr(route, "original_router", None)
            original_routes = getattr(original_router, "routes", None)
            if isinstance(original_routes, list):
                include_context = getattr(route, "include_context", None)
                include_prefix = getattr(include_context, "prefix", "")
                visit(original_routes, join_path(prefix, include_prefix))

            nested_routes = getattr(route, "routes", None)
            if isinstance(nested_routes, list):
                visit(nested_routes, join_path(prefix, path or ""))

    visit(routes)
    return paths


@router.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    timestamp = datetime.now(UTC).isoformat()
    return {
        "status": "ok",
        "service": "anatole-api",
        "version": ANATOLE_VERSION,
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
    available_routes = _route_paths(request.app.routes)
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
