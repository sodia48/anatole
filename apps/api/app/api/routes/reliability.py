from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request, status

from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.services.accounts import account_service
from app.schemas.reliability import (
    ClientEventRequest,
    FeedbackReportRequest,
    FeedbackReportResponse,
    ReliabilitySnapshot,
)


router = APIRouter()
logger = logging.getLogger("anatole.reliability")


@router.get(
    "/status",
    response_model=ReliabilitySnapshot,
    summary="Métriques opérationnelles du processus FastAPI courant",
)
async def reliability_status() -> ReliabilitySnapshot:
    payload = reliability_monitor.snapshot()
    return ReliabilitySnapshot(
        **payload,
        upstream_metrics=shared_http_client.metrics.as_dict(),
        generated_at=datetime.now(UTC),
    )


@router.post(
    "/feedback",
    response_model=FeedbackReportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enregistre un signalement bêta dans les logs opérationnels",
)
async def feedback(
    report: FeedbackReportRequest,
    request: Request,
) -> FeedbackReportResponse:
    report_id = f"AN-{uuid.uuid4().hex[:10].upper()}"
    request_id = getattr(request.state, "request_id", None)
    reliability_monitor.record_report()

    diagnostics = {
        "route": report.route,
        "section": report.section,
        "universe": report.universe,
        "request_id": report.request_id or request_id,
        "viewport": (
            f"{report.viewport_width}x{report.viewport_height}"
            if report.viewport_width and report.viewport_height
            else None
        ),
        "app_version": report.app_version,
        "user_agent": report.user_agent,
    }
    if not report.consent_diagnostics:
        diagnostics = {"diagnostics": "not_provided"}

    logger.warning(
        "beta_feedback %s",
        json.dumps(
            {
                "report_id": report_id,
                "category": report.category,
                "message": report.message,
                "diagnostics": diagnostics,
            },
            ensure_ascii=False,
        ),
    )
    try:
        await account_service.store_feedback_report(
            {
                "report_id": report_id,
                "category": report.category,
                "message": report.message,
                "route": report.route,
                "section": report.section,
                "universe": report.universe,
                "request_id": report.request_id or request_id,
                "viewport": diagnostics.get("viewport") if report.consent_diagnostics else None,
                "app_version": report.app_version,
                "user_agent": report.user_agent if report.consent_diagnostics else None,
                "diagnostics_included": report.consent_diagnostics,
            }
        )
    except Exception:
        logger.exception("beta_feedback_persistence_failed report_id=%s", report_id)
    return FeedbackReportResponse(
        report_id=report_id,
        received_at=datetime.now(UTC),
        detail=(
            "Signalement reçu. Il est enregistré dans les logs opérationnels "
            "Anatole sans données de portefeuille ni profil financier."
        ),
    )


@router.post(
    "/client-event",
    status_code=status.HTTP_202_ACCEPTED,
    include_in_schema=False,
)
async def client_event(
    event: ClientEventRequest,
    request: Request,
) -> dict[str, bool]:
    logger.warning(
        "client_event %s",
        json.dumps(
            {
                **event.model_dump(mode="json"),
                "ingest_request_id": getattr(request.state, "request_id", None),
            },
            ensure_ascii=False,
        ),
    )
    return {"accepted": True}
