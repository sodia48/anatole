from fastapi import APIRouter, HTTPException

from app.schemas.backtest import (
    AnatoleScriptValidation,
    AnatoleScriptValidationRequest,
    BacktestRequest,
    BacktestResult,
)
from app.services.anatole_script import validate_script
from app.services.backtest import backtest_service


router = APIRouter()


@router.post(
    "",
    response_model=BacktestResult,
    summary="Backtest une stratégie Focus Pro sans anticipation",
)
async def run_backtest(request: BacktestRequest) -> BacktestResult:
    try:
        return await backtest_service.run(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/script/validate",
    response_model=AnatoleScriptValidation,
    summary="Parse et valide un Anatole Script sans exécuter de code utilisateur",
)
async def validate_anatole_script(
    request: AnatoleScriptValidationRequest,
) -> AnatoleScriptValidation:
    return validate_script(request.source)
