from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Awaitable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.core.version import ANATOLE_VERSION
from app.services.accounts import account_service
from app.services.calendar import calendar_service
from app.services.cockpit import cockpit_service
from app.services.company_network import company_network_service
from app.services.news import news_service
from app.services.notifications import notification_service
from app.services.paper_trading import paper_trading_service
from app.services.psychology import psychology_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("anatole.api")


async def _warm_source(
    label: str,
    operation: Awaitable[object],
) -> None:
    started = time.perf_counter()
    try:
        await operation
        logger.info(
            "startup_warm_success source=%s duration_ms=%.1f",
            label,
            (time.perf_counter() - started) * 1000,
        )
    except asyncio.CancelledError:
        raise
    except Exception as error:  # noqa: BLE001
        logger.warning(
            "startup_warm_failed source=%s error=%s detail=%s",
            label,
            type(error).__name__,
            error,
        )


async def _warm_public_snapshots() -> None:
    # Launch only after the API is ready. No warm-up is awaited by startup.
    await asyncio.gather(
        _warm_source("cockpit:composite", cockpit_service.get_composite()),
        _warm_source("cockpit:tsx60", cockpit_service.get_tsx60()),
        _warm_source("psychology", psychology_service.get_snapshot()),
    )

    await asyncio.sleep(0.15)

    await asyncio.gather(
        _warm_source("news:fr", news_service.get_snapshot("fr")),
        _warm_source("calendar:fr", calendar_service.get_snapshot("fr")),
    )

    await asyncio.sleep(0.35)

    await asyncio.gather(
        _warm_source("news:en", news_service.get_snapshot("en")),
        _warm_source("calendar:en", calendar_service.get_snapshot("en")),
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    await shared_http_client.start()
    await account_service.start()
    await company_network_service.start()
    notification_service.account_service = account_service
    await notification_service.start()
    paper_trading_service.account_service = account_service
    await paper_trading_service.start()
    psychology_service.ensure_refresh()
    warm_task = asyncio.create_task(
        _warm_public_snapshots(),
        name="anatole-public-warmup",
    )
    logger.info("anatole_api_started shared_http_pool=true")
    try:
        yield
    finally:
        if not warm_task.done():
            warm_task.cancel()
        await asyncio.gather(warm_task, return_exceptions=True)
        await company_network_service.close()
        await shared_http_client.close()
        await account_service.close()
        logger.info("anatole_api_stopped shared_http_pool=false")


app = FastAPI(
    title="Anatole API",
    version=ANATOLE_VERSION,
    description="API de marché et d’analyse de la plateforme Anatole.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
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
    response.headers["X-Anatole-Version"] = ANATOLE_VERSION
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
