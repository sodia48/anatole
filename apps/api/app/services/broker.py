from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.paper_trading import (
    PaperAccount,
    PaperOrder,
    PaperOrderPreview,
    PaperOrderRequest,
)
from app.services.paper_trading import (
    PaperTradingService,
    paper_trading_service,
)


class BrokerAdapter(ABC):
    """Interface volontairement limitée; aucun courtier réel n’est activé."""

    live_trading_enabled = False

    @abstractmethod
    async def get_account(self, user_id: str) -> PaperAccount: ...

    @abstractmethod
    async def get_positions(self, user_id: str): ...

    @abstractmethod
    async def get_orders(self, user_id: str): ...

    @abstractmethod
    async def preview_order(
        self,
        user_id: str,
        request: PaperOrderRequest,
    ) -> PaperOrderPreview: ...

    @abstractmethod
    async def place_order(
        self,
        user_id: str,
        request: PaperOrderRequest,
    ) -> PaperOrder: ...

    @abstractmethod
    async def cancel_order(
        self,
        user_id: str,
        order_id: str,
    ) -> PaperOrder: ...


class PaperBrokerAdapter(BrokerAdapter):
    live_trading_enabled = False

    def __init__(
        self,
        service: PaperTradingService = paper_trading_service,
    ) -> None:
        self.service = service

    async def get_account(self, user_id: str) -> PaperAccount:
        return await self.service.get_account(user_id)

    async def get_positions(self, user_id: str):
        return (await self.get_account(user_id)).positions

    async def get_orders(self, user_id: str):
        return (await self.get_account(user_id)).orders

    async def preview_order(
        self,
        user_id: str,
        request: PaperOrderRequest,
    ) -> PaperOrderPreview:
        return await self.service.preview(user_id, request)

    async def place_order(
        self,
        user_id: str,
        request: PaperOrderRequest,
    ) -> PaperOrder:
        return await self.service.place_order(user_id, request)

    async def cancel_order(
        self,
        user_id: str,
        order_id: str,
    ) -> PaperOrder:
        return await self.service.cancel_order(user_id, order_id)


paper_broker_adapter = PaperBrokerAdapter()
