from fastapi import APIRouter, Query

from app.schemas.workspace import (
    AlertEvaluateRequest,
    AlertSnapshot,
    AdvisorPlan,
    AdvisorPlanRequest,
    AssistantRequest,
    AssistantResponse,
    DataQualitySnapshot,
    PortfolioAnalyzeRequest,
    PortfolioSnapshot,
)
from app.services.alerts import alert_service
from app.services.advisor import advisor_service
from app.services.assistant import assistant_service
from app.services.data_quality import data_quality_service
from app.services.portfolio import portfolio_service


router = APIRouter()


@router.post(
    "/portfolio",
    response_model=PortfolioSnapshot,
    summary="Analyse un portefeuille local sans exécution d’ordres",
)
async def portfolio(
    request: PortfolioAnalyzeRequest,
    fast: bool = Query(default=False),
) -> PortfolioSnapshot:
    return await portfolio_service.analyze(request, fast=fast)


@router.post(
    "/alerts/evaluate",
    response_model=AlertSnapshot,
    summary="Évalue un ensemble d’alertes de marché",
)
async def evaluate_alerts(request: AlertEvaluateRequest) -> AlertSnapshot:
    return await alert_service.evaluate(request)


@router.post(
    "/advisor-plan",
    response_model=AdvisorPlan,
    summary="Construit un plan de décision sans recommandation de placement",
)
async def advisor_plan(request: AdvisorPlanRequest) -> AdvisorPlan:
    return await advisor_service.build(request)


@router.post(
    "/assistant",
    response_model=AssistantResponse,
    summary="Assistant contextuel fondé sur les données Anatole",
)
async def assistant(request: AssistantRequest) -> AssistantResponse:
    return await assistant_service.answer(request)


@router.get(
    "/data-quality",
    response_model=DataQualitySnapshot,
    summary="État, couverture et fraîcheur des sources Anatole",
)
async def data_quality() -> DataQualitySnapshot:
    return data_quality_service.snapshot()
