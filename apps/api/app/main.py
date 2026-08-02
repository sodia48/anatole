from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.services.accounts import account_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("anatole.api")


@asynccontextmanager
async def lifespan(application: FastAPI):
    await shared_http_client.start()
    await account_service.start()

    required_admin_routes = {
        "/api/v1/admin/overview",
        "/api/v1/admin/users",
        "/api/v1/admin/invites",
        "/api/v1/admin/reports",
    }
    available_routes = {
        getattr(route, "path", "")
        for route in application.routes
    }
    missing_admin_routes = sorted(
        required_admin_routes - available_routes
    )
    if missing_admin_routes:
        raise RuntimeError(
            "Admin routes missing: "
            + ", ".join(missing_admin_routes)
        )

    logger.info(
        "anatole_api_started shared_http_pool=true "
        "admin_routes=true configured_admins=%s",
        len(settings.account_admin_email_set),
    )
    try:
        yield
    finally:
        await shared_http_client.close()
        await account_service.close()
        logger.info("anatole_api_stopped shared_http_pool=false")


app = FastAPI(
    title="Anatole API",
    version="1.1.4",
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
    response.headers["X-Anatole-Version"] = "1.1.4"
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
