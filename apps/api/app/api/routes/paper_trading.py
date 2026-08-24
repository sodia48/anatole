from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.routes.accounts import current_user
from app.schemas.accounts import AccountUser
from app.schemas.paper_trading import (
    PaperAccount,
    PaperAuditEvent,
    PaperOrder,
    PaperOrderPreview,
    PaperOrderRequest,
    PaperResetRequest,
)
from app.services.broker import paper_broker_adapter
from app.services.paper_trading import paper_trading_service


router = APIRouter()


class _PaperThrottle:
    def __init__(self, limit: int = 30, window_seconds: float = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.values: dict[str, deque[float]] = defaultdict(deque)
        self.lock = asyncio.Lock()

    async def check(self, user_id: str) -> None:
        async with self.lock:
            now = monotonic()
            values = self.values[user_id]
            while values and now - values[0] > self.window_seconds:
                values.popleft()
            if len(values) >= self.limit:
                raise HTTPException(
                    status_code=429,
                    detail="Trop de requêtes PAPER; réessaie dans une minute.",
                )
            values.append(now)


_throttle = _PaperThrottle()


@router.get("/account", response_model=PaperAccount)
async def paper_account(
    user: AccountUser = Depends(current_user),
) -> PaperAccount:
    return await paper_broker_adapter.get_account(user.id)


@router.post("/orders/preview", response_model=PaperOrderPreview)
async def preview_order(
    request: PaperOrderRequest,
    user: AccountUser = Depends(current_user),
) -> PaperOrderPreview:
    await _throttle.check(user.id)
    return await paper_broker_adapter.preview_order(user.id, request)


@router.post("/orders", response_model=PaperOrder, status_code=201)
async def place_order(
    request: PaperOrderRequest,
    user: AccountUser = Depends(current_user),
) -> PaperOrder:
    await _throttle.check(user.id)
    try:
        return await paper_broker_adapter.place_order(user.id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/orders/{order_id}/cancel", response_model=PaperOrder)
async def cancel_order(
    order_id: str,
    user: AccountUser = Depends(current_user),
) -> PaperOrder:
    await _throttle.check(user.id)
    try:
        return await paper_broker_adapter.cancel_order(user.id, order_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/refresh", response_model=PaperAccount)
async def refresh_paper_account(
    user: AccountUser = Depends(current_user),
) -> PaperAccount:
    await _throttle.check(user.id)
    return await paper_trading_service.refresh(user.id)


@router.post("/reset", response_model=PaperAccount)
async def reset_paper_account(
    request: PaperResetRequest,
    user: AccountUser = Depends(current_user),
) -> PaperAccount:
    await _throttle.check(user.id)
    return await paper_trading_service.reset(user.id, request)


@router.get("/audit", response_model=list[PaperAuditEvent])
async def paper_audit_log(
    limit: int = Query(default=100, ge=1, le=200),
    user: AccountUser = Depends(current_user),
) -> list[PaperAuditEvent]:
    return await paper_trading_service.audit_log(user.id, limit=limit)
