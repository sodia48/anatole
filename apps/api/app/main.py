from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
try:
    from app.api.routes import admin as admin_routes
except ImportError:  # Keep the public API alive during a partial deployment.
    admin_routes = None
from app.core.config import settings
from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.services.accounts import account_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("anatole.api")

ADMIN_PREFIX = "/api/v1/admin"
REQUIRED_ADMIN_ROUTES = {
    f"{ADMIN_PREFIX}/overview",
    f"{ADMIN_PREFIX}/users",
    f"{ADMIN_PREFIX}/invites",
    f"{ADMIN_PREFIX}/reports",
}


def route_paths(application: FastAPI) -> set[str]:
    return {
        getattr(route, "path", "")
        for route in application.routes
        if getattr(route, "path", "")
    }


def ensure_admin_routes(application: FastAPI) -> None:
    """Register the admin router once, even after a partially applied patch."""
    if REQUIRED_ADMIN_ROUTES.issubset(route_paths(application)):
        return

    if admin_routes is None:
        logger.error("admin_module_unavailable")
        return

    application.include_router(
        admin_routes.router,
        prefix=ADMIN_PREFIX,
        tags=["admin"],
    )


@asynccontextmanager
async def lifespan(application: FastAPI):
    await shared_http_client.start()
    await account_service.start()

    missing = sorted(REQUIRED_ADMIN_ROUTES - route_paths(application))
    if missing:
        # Never take the market API offline because an optional admin module is
        # incomplete. The /ready diagnostic reports the exact missing routes.
        logger.error("admin_routes_missing routes=%s", ",".join(missing))
    else:
        logger.info(
            "admin_console_ready configured_admins=%s",
            len(settings.account_admin_email_set),
        )

    logger.info("anatole_api_started shared_http_pool=true")
    try:
        yield
    finally:
        await shared_http_client.close()
        await account_service.close()
        logger.info("anatole_api_stopped shared_http_pool=false")


app = FastAPI(
    title="Anatole API",
    version="1.1.5",
    description="API de marché et d’analyse de la plateforme Anatole.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_observability(
    request: Request,
    call_next,
):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
    request.state.request_id = request_id
    cf_ray = request.headers.get("CF-Ray", "-")
    started = time.perf_counter()

    logger.info(
        "request_started id=%s cf_ray=%s method=%s path=%s",
        request_id,
        cf_ray,
        request.method,
        request.url.path,
    )

    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        reliability_monitor.record_exception(
            path=request.url.path,
            method=request.method,
            duration_ms=elapsed_ms,
            request_id=request_id,
        )
        logger.exception(
            "request_failed id=%s cf_ray=%s path=%s duration_ms=%.1f",
            request_id,
            cf_ray,
            request.url.path,
            elapsed_ms,
        )
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Une erreur interne temporaire est survenue.",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id},
        )

    elapsed_ms = (time.perf_counter() - started) * 1000
    reliability_monitor.record_request(
        path=request.url.path,
        method=request.method,
        status_code=response.status_code,
        duration_ms=elapsed_ms,
        request_id=request_id,
    )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Anatole-Version"] = "1.1.5"
    response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.1f}"

    logger.info(
        "request_finished id=%s cf_ray=%s path=%s status=%s duration_ms=%.1f",
        request_id,
        cf_ray,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


app.include_router(api_router)
ensure_admin_routes(app)
