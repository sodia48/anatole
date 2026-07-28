from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.resilience import shared_http_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("anatole.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await shared_http_client.start()
    logger.info("anatole_api_started shared_http_pool=true")
    try:
        yield
    finally:
        await shared_http_client.close()
        logger.info("anatole_api_stopped shared_http_pool=false")


app = FastAPI(
    title="Anatole API",
    version="0.6.0",
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
        logger.exception(
            "request_failed id=%s cf_ray=%s path=%s duration_ms=%.1f",
            request_id,
            cf_ray,
            request.url.path,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
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
