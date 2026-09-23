from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Awaitable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.hotset_policy import choose_hotset_policy
from app.core.production_baseline import production_baseline_store
from app.core.resilience import shared_http_client
from app.core.telemetry import performance_monitor, reliability_monitor
from app.core.version import ANATOLE_VERSION
from app.services.accounts import account_service
from app.services.calendar import calendar_service
from app.services.canada_360 import canada_360_service
from app.services.cockpit import cockpit_service
from app.services.company_network import company_network_service
from app.services.news import news_service
from app.services.notifications import notification_service
from app.services.paper_trading import paper_trading_service
from app.services.psychology import psychology_service
from app.services.provincial_statistics import provincial_statistics_service

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


async def _warm_public_snapshots_once() -> None:
    # The first visible request wins over background work. Warm the smallest,
    # highest-value snapshots first and deliberately postpone heavier Composite
    # and secondary-language discovery calls.
    await asyncio.gather(
        _warm_source("cockpit:tsx60", cockpit_service.get_tsx60()),
        _warm_source("psychology", psychology_service.get_snapshot()),
    )

    await asyncio.sleep(0.35)

    await asyncio.gather(
        _warm_source("news:fr", news_service.get_snapshot("fr")),
        _warm_source("calendar:fr", calendar_service.get_snapshot("fr")),
    )

    await asyncio.sleep(0.75)

    await asyncio.gather(
        _warm_source("cockpit:composite", cockpit_service.get_composite()),
        _warm_source("canada360:fr", canada_360_service.get_snapshot("fr")),
    )

    await asyncio.sleep(0.35)

    await asyncio.gather(
        _warm_source("news:en", news_service.get_snapshot("en")),
        _warm_source("calendar:en", calendar_service.get_snapshot("en")),
    )

    await asyncio.sleep(0.35)
    await _warm_source("canada360:en", canada_360_service.get_snapshot("en"))


async def _maintain_public_hotset() -> None:
    # Keep public snapshots warm, but never let speculative background refresh
    # compete indefinitely with interactive traffic. Phase 3H reads the real
    # p95/error/provider telemetry introduced in Phase 3D and backs off
    # automatically under pressure.
    await _warm_public_snapshots_once()

    now = time.monotonic()
    next_due = {
        "tsx60": now + 20.0,
        "psychology": now + 60.0,
        "composite": now + 100.0,
        "canada360": now + 120.0,
        "discovery": now + 120.0,
    }
    last_level: str | None = None

    while True:
        reliability = reliability_monitor.snapshot()
        performance = performance_monitor.snapshot()
        policy = choose_hotset_policy(reliability, performance)

        if policy.level != last_level:
            logger.info(
                "public_hotset_policy level=%s api_p95_ms=%.1f error_rate_5xx=%.3f",
                policy.level,
                float(reliability.get("p95_duration_ms") or 0.0),
                float(reliability.get("error_rate_5xx") or 0.0),
            )
            last_level = policy.level

        await asyncio.sleep(policy.poll_seconds)
        now = time.monotonic()
        tasks: list[Awaitable[object]] = []

        if now >= next_due["tsx60"]:
            tasks.append(
                _warm_source(
                    "cockpit:tsx60",
                    cockpit_service.get_tsx60(),
                )
            )
            next_due["tsx60"] = now + policy.tsx60_seconds

        if now >= next_due["psychology"]:
            tasks.append(
                _warm_source(
                    "psychology",
                    psychology_service.get_snapshot(),
                )
            )
            next_due["psychology"] = now + policy.psychology_seconds

        if now >= next_due["composite"]:
            tasks.append(
                _warm_source(
                    "cockpit:composite",
                    cockpit_service.get_composite(),
                )
            )
            next_due["composite"] = now + policy.composite_seconds

        if now >= next_due["canada360"]:
            tasks.extend(
                [
                    _warm_source("canada360:fr", canada_360_service.get_snapshot("fr")),
                    _warm_source("canada360:en", canada_360_service.get_snapshot("en")),
                ]
            )
            next_due["canada360"] = now + policy.discovery_seconds

        if now >= next_due["discovery"]:
            tasks.extend(
                [
                    _warm_source(
                        "news:fr",
                        news_service.get_snapshot("fr"),
                    ),
                    _warm_source(
                        "calendar:fr",
                        calendar_service.get_snapshot("fr"),
                    ),
                    _warm_source(
                        "news:en",
                        news_service.get_snapshot("en"),
                    ),
                    _warm_source(
                        "calendar:en",
                        calendar_service.get_snapshot("en"),
                    ),
                ]
            )
            next_due["discovery"] = now + policy.discovery_seconds

        if tasks:
            await asyncio.gather(*tasks)


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
        _maintain_public_hotset(),
        name="anatole-public-hotset",
    )
    baseline_task = asyncio.create_task(
        production_baseline_store.run(),
        name="anatole-production-baseline",
    )
    logger.info("anatole_api_started shared_http_pool=true")
    try:
        yield
    finally:
        for task in (warm_task, baseline_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(
            warm_task,
            baseline_task,
            return_exceptions=True,
        )
        await production_baseline_store.close()
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
    GZipMiddleware,
    minimum_size=1_024,
    compresslevel=5,
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
