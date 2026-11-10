from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Awaitable
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

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
from app.services.institution_collector import maintain_recent_13f
from app.services.institutions import institution_service
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


async def _bootstrap_institutions_bundle(path: Path) -> None:
    store = institution_service._store
    if store is None:
        return
    run_id = str(uuid.uuid4())
    if not await asyncio.to_thread(store.start_run, run_id, "bundled:SEC-13F-2026-Q2"):
        logger.info("institution_bundle_bootstrap skipped=collector_busy")
        return
    started = time.perf_counter()
    try:
        installed = await asyncio.to_thread(store.bootstrap_bundle, path)
        await asyncio.to_thread(
            store.finish_run, run_id, period=date(2026, 6, 30),
            institutions_count=100 if installed else 0,
        )
        logger.info(
            "institution_bundle_bootstrap installed=%s duration_ms=%.1f",
            installed, (time.perf_counter() - started) * 1000,
        )
    except asyncio.CancelledError:
        raise
    except Exception as error:  # noqa: BLE001
        await asyncio.to_thread(
            store.finish_run, run_id, period=None,
            institutions_count=0, error_category=type(error).__name__,
        )
        logger.error("institution_bundle_bootstrap_failed category=%s", type(error).__name__)


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
    institution_bootstrap_task: asyncio.Task[None] | None = None
    if institution_service._store is not None:
        store = institution_service._store
        await asyncio.to_thread(store.create_schema)
        symbols = Path(__file__).resolve().parent / "data" / "institution_symbol_map.json"
        await asyncio.to_thread(store.seed_symbols, symbols)
        if settings.app_env == "production":
            latest = await asyncio.to_thread(store.latest_snapshot)
            if latest is None or latest.report_period is None or latest.report_period < date(2026, 6, 30):
                bundle = Path(__file__).resolve().parent / "data" / "institution_details_t2_2026.json.gz"
                institution_bootstrap_task = asyncio.create_task(
                    _bootstrap_institutions_bundle(bundle),
                    name="anatole-institution-bundle-bootstrap",
                )
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
    reminder_task = asyncio.create_task(notification_service.run_option_reminder_worker(), name="anatole-option-reminders")
    institution_discovery_task = (
        asyncio.create_task(
            maintain_recent_13f(institution_service._store),
            name="anatole-institution-discovery",
        )
        if settings.app_env == "production" and institution_service._store is not None
        else None
    )
    logger.info("anatole_api_started shared_http_pool=true")
    try:
        yield
    finally:
        tasks_to_stop = (
            warm_task, baseline_task, reminder_task,
            institution_bootstrap_task, institution_discovery_task,
        )
        for task in tasks_to_stop:
            if task is None:
                continue
            if task is institution_bootstrap_task:
                # A DB transaction is still running in a worker thread; let it
                # finish rather than releasing the collection lease early.
                continue
            if not task.done():
                task.cancel()
        await asyncio.gather(
            *(task for task in tasks_to_stop if task is not None),
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
