from fastapi import APIRouter, HTTPException, Query

from app.schemas.options import OptionChainSnapshot, OptionUniverseSnapshot
from app.services.options import options_service
from app.schemas.options_payoff import BreakEvenResult, PayoffPoint, PayoffRequest, PayoffResponse
from app.services.options_payoff import OptionLeg, UnderlyingLeg, break_evens, payoff, payoff_bounds, theoretical_debit


router = APIRouter()


@router.post("/strategy/payoff", response_model=PayoffResponse)
async def option_strategy_payoff(request: PayoffRequest) -> PayoffResponse:
    """Calculate an explicitly supplied, single-expiry hypothetical position."""
    try:
        legs = [OptionLeg(**leg.model_dump()) for leg in request.legs]
        underlying = UnderlyingLeg(**request.underlying.model_dump()) if request.underlying else None
        bounds = payoff_bounds(legs, domain_min=request.domain_min, domain_max=request.domain_max, underlying=underlying)
        roots = break_evens(legs, domain_min=request.domain_min, domain_max=request.domain_max, underlying=underlying)
        if any((request.domain_min is not None and price < request.domain_min) or
               (request.domain_max is not None and price > request.domain_max) for price in request.prices):
            raise ValueError("a requested price is outside the specified domain")
        return PayoffResponse(
            currency=legs[0].currency, expiry=legs[0].expiry,
            points=[PayoffPoint(price=price, profit_loss=payoff(legs, price, underlying)) for price in request.prices],
            theoretical_debit=theoretical_debit(legs, underlying),
            minimum_profit_loss=bounds.minimum, maximum_profit_loss=bounds.maximum,
            loss_unbounded=bounds.lower_unbounded, gain_unbounded=bounds.upper_unbounded,
            break_evens=[BreakEvenResult(lower=root.lower, upper=root.upper) for root in roots],
            limitations=["Hypothetical expiration payoff; caller-supplied contracts and prices are not verified.",
                         "Excludes fees, taxes, FX, financing, margin, early exercise, assignment and settlement effects.",
                         "Multiple expiries and futures-style margining are not supported; break-even values use decimal precision."],
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/universe", response_model=OptionUniverseSnapshot)
async def option_universe(
    market: str = Query("tsx"),
) -> OptionUniverseSnapshot:
    try:
        return await options_service.universe(market)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/chain", response_model=OptionChainSnapshot)
async def option_chain(
    market: str = Query("tsx"),
    symbol: str = Query(..., min_length=1, max_length=16),
    expiration: str | None = Query(None),
    contract: str | None = Query(None),
) -> OptionChainSnapshot:
    try:
        return await options_service.chain(
            market=market,
            symbol=symbol,
            expiration=expiration,
            contract=contract,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
