from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    MetaData,
    String,
    Table,
    Text,
    delete,
    insert,
    select,
    update,
)

from app.schemas.paper_trading import (
    PaperAccount,
    PaperAuditEvent,
    PaperOrder,
    PaperOrderPreview,
    PaperOrderRequest,
    PaperPosition,
    PaperResetRequest,
    PaperTrade,
)
from app.schemas.stocks import Candle, Quote
from app.services.accounts import AccountService, account_service
from app.services.market_data import market_data_service


DEFAULT_INITIAL_CAPITAL = 100_000.0
MAX_ORDER_NOTIONAL = 100_000_000.0
PAPER_SLIPPAGE_PERCENT = 0.02


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def _datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class PaperTradingService:
    def __init__(self, accounts: AccountService = account_service) -> None:
        self.account_service = accounts
        self.metadata = MetaData()
        self.accounts = Table(
            "paper_accounts",
            self.metadata,
            Column("user_id", String(36), primary_key=True),
            Column("initial_capital", Float, nullable=False),
            Column("cash", Float, nullable=False),
            Column("commission", Float, nullable=False),
            Column("created_at", String(40), nullable=False),
            Column("updated_at", String(40), nullable=False),
        )
        self.orders = Table(
            "paper_orders",
            self.metadata,
            Column("id", String(36), primary_key=True),
            Column("user_id", String(36), nullable=False, index=True),
            Column("ticker", String(20), nullable=False, index=True),
            Column("order_type", String(20), nullable=False),
            Column("side", String(8), nullable=False),
            Column("quantity", Float, nullable=False),
            Column("limit_price", Float, nullable=True),
            Column("stop_price", Float, nullable=True),
            Column("status", String(20), nullable=False, index=True),
            Column("submitted_market_time", String(40), nullable=False),
            Column("created_at", String(40), nullable=False),
            Column("activated", Boolean, nullable=False, default=False),
            Column("activated_at", String(40), nullable=True),
            Column("filled_at", String(40), nullable=True),
            Column("filled_price", Float, nullable=True),
            Column("cancelled_at", String(40), nullable=True),
            Column("rejection_reason", Text, nullable=True),
        )
        self.positions = Table(
            "paper_positions",
            self.metadata,
            Column("id", String(80), primary_key=True),
            Column("user_id", String(36), nullable=False, index=True),
            Column("ticker", String(20), nullable=False, index=True),
            Column("quantity", Float, nullable=False),
            Column("average_cost", Float, nullable=False),
            Column("realized_pnl", Float, nullable=False),
            Column("updated_at", String(40), nullable=False),
        )
        self.trades = Table(
            "paper_trades",
            self.metadata,
            Column("id", String(36), primary_key=True),
            Column("user_id", String(36), nullable=False, index=True),
            Column("order_id", String(36), nullable=False, index=True),
            Column("ticker", String(20), nullable=False),
            Column("side", String(8), nullable=False),
            Column("quantity", Float, nullable=False),
            Column("price", Float, nullable=False),
            Column("notional", Float, nullable=False),
            Column("commission", Float, nullable=False),
            Column("realized_pnl", Float, nullable=False),
            Column("executed_at", String(40), nullable=False),
        )
        self.audit = Table(
            "paper_audit_log",
            self.metadata,
            Column("id", String(36), primary_key=True),
            Column("user_id", String(36), nullable=False, index=True),
            Column("action", String(40), nullable=False),
            Column("entity_id", String(36), nullable=True),
            Column("detail", Text, nullable=False),
            Column("created_at", String(40), nullable=False),
        )
        self._schema_ready_for: str | None = None

    async def start(self) -> None:
        await self.account_service.start()
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        engine_key = str(self.account_service.engine.url)
        if self._schema_ready_for == engine_key:
            return
        self.metadata.create_all(self.account_service.engine)
        self._schema_ready_for = engine_key

    def _audit(
        self,
        connection: Any,
        user_id: str,
        action: str,
        detail: str,
        entity_id: str | None = None,
    ) -> None:
        connection.execute(insert(self.audit).values(
            id=str(uuid.uuid4()),
            user_id=user_id,
            action=action,
            entity_id=entity_id,
            detail=detail[:1_000],
            created_at=_iso(_now()),
        ))

    def _ensure_account_sync(self, connection: Any, user_id: str) -> Any:
        row = connection.execute(
            select(self.accounts).where(self.accounts.c.user_id == user_id)
        ).mappings().first()
        if row is not None:
            return row
        now = _iso(_now())
        connection.execute(insert(self.accounts).values(
            user_id=user_id,
            initial_capital=DEFAULT_INITIAL_CAPITAL,
            cash=DEFAULT_INITIAL_CAPITAL,
            commission=0.0,
            created_at=now,
            updated_at=now,
        ))
        self._audit(
            connection,
            user_id,
            "account_created",
            "Compte de simulation créé avec 100 000 CAD.",
        )
        return connection.execute(
            select(self.accounts).where(self.accounts.c.user_id == user_id)
        ).mappings().one()

    async def preview(
        self,
        user_id: str,
        request: PaperOrderRequest,
    ) -> PaperOrderPreview:
        await self.start()
        quote = await market_data_service.get_quote(request.ticker)
        account, position, reserved = await asyncio.to_thread(
            self._preview_rows_sync,
            user_id,
            request.ticker,
        )
        estimated_price = (
            request.limit_price
            if request.order_type in {"limit", "stop_limit"}
            else request.stop_price
            if request.order_type == "stop"
            else quote.price
        ) or quote.price
        notional = estimated_price * request.quantity
        sufficient = (
            account.cash - reserved >= notional + account.commission
            if request.side == "buy"
            else position >= request.quantity
        )
        return PaperOrderPreview(
            ticker=request.ticker,
            side=request.side,
            order_type=request.order_type,
            quantity=request.quantity,
            estimated_price=round(estimated_price, 4),
            estimated_notional=round(notional, 2),
            estimated_commission=round(account.commission, 2),
            available_cash=round(account.cash - reserved, 2),
            existing_position=round(position, 6),
            sufficient_cash=sufficient,
            message=(
                "Ordre simulé admissible; aucune exécution réelle."
                if sufficient
                else "Capital ou position insuffisante pour cet ordre simulé."
            ),
        )

    def _preview_rows_sync(
        self,
        user_id: str,
        ticker: str,
    ) -> tuple[Any, float, float]:
        with self.account_service.engine.begin() as connection:
            account = self._ensure_account_sync(connection, user_id)
            position = connection.execute(
                select(self.positions.c.quantity).where(
                    self.positions.c.user_id == user_id,
                    self.positions.c.ticker == ticker,
                )
            ).scalar_one_or_none() or 0.0
            pending = connection.execute(
                select(self.orders).where(
                    self.orders.c.user_id == user_id,
                    self.orders.c.status == "pending",
                    self.orders.c.side == "buy",
                )
            ).mappings().all()
            reserved = sum(
                float(row.quantity)
                * float(row.limit_price or row.stop_price or 0)
                + float(account.commission)
                for row in pending
            )
        return account, float(position), reserved

    async def place_order(
        self,
        user_id: str,
        request: PaperOrderRequest,
    ) -> PaperOrder:
        preview, quote = await asyncio.gather(
            self.preview(user_id, request),
            market_data_service.get_quote(request.ticker),
        )
        if preview.estimated_notional > MAX_ORDER_NOTIONAL:
            raise ValueError("La valeur notionnelle dépasse la limite PAPER.")
        if not preview.sufficient_cash:
            raise ValueError(preview.message)
        return await asyncio.to_thread(
            self._place_order_sync,
            user_id,
            request,
            quote,
        )

    def _place_order_sync(
        self,
        user_id: str,
        request: PaperOrderRequest,
        quote: Quote,
    ) -> PaperOrder:
        order_id = str(uuid.uuid4())
        created = _now()
        market_time = quote.timestamp
        if market_time.tzinfo is None:
            market_time = market_time.replace(tzinfo=UTC)
        values = {
            "id": order_id,
            "user_id": user_id,
            "ticker": request.ticker,
            "order_type": request.order_type,
            "side": request.side,
            "quantity": request.quantity,
            "limit_price": request.limit_price,
            "stop_price": request.stop_price,
            "status": "pending",
            "submitted_market_time": _iso(market_time),
            "created_at": _iso(created),
            "activated": False,
            "activated_at": None,
            "filled_at": None,
            "filled_price": None,
            "cancelled_at": None,
            "rejection_reason": None,
        }
        with self.account_service.engine.begin() as connection:
            self._ensure_account_sync(connection, user_id)
            connection.execute(insert(self.orders).values(**values))
            self._audit(
                connection,
                user_id,
                "order_placed",
                f"{request.side} {request.quantity:g} {request.ticker} · {request.order_type}",
                order_id,
            )
        return self._order(values)

    async def cancel_order(self, user_id: str, order_id: str) -> PaperOrder:
        await self.start()
        return await asyncio.to_thread(
            self._cancel_order_sync,
            user_id,
            order_id,
        )

    def _cancel_order_sync(self, user_id: str, order_id: str) -> PaperOrder:
        cancelled = _now()
        with self.account_service.engine.begin() as connection:
            row = connection.execute(select(self.orders).where(
                self.orders.c.id == order_id,
                self.orders.c.user_id == user_id,
            )).mappings().first()
            if row is None:
                raise LookupError("Ordre PAPER introuvable.")
            if row.status != "pending":
                raise ValueError("Seul un ordre en attente peut être annulé.")
            connection.execute(update(self.orders).where(
                self.orders.c.id == order_id,
                self.orders.c.user_id == user_id,
            ).values(status="cancelled", cancelled_at=_iso(cancelled)))
            self._audit(
                connection,
                user_id,
                "order_cancelled",
                "Ordre PAPER annulé par l’utilisateur.",
                order_id,
            )
            values = dict(row)
            values.update(status="cancelled", cancelled_at=_iso(cancelled))
        return self._order(values)

    async def refresh(self, user_id: str) -> PaperAccount:
        await self.start()
        tickers = await asyncio.to_thread(self._pending_tickers_sync, user_id)
        if tickers:
            quotes = await market_data_service.get_quotes(tickers)
            for quote in quotes:
                observed = quote.timestamp
                if observed.tzinfo is None:
                    observed = observed.replace(tzinfo=UTC)
                await self.process_observation(
                    user_id,
                    quote.symbol.removesuffix(".TO"),
                    Candle(
                        time=int(observed.timestamp()),
                        open=quote.price,
                        high=quote.price,
                        low=quote.price,
                        close=quote.price,
                        volume=quote.volume,
                    ),
                )
        return await self.get_account(user_id)

    def _pending_tickers_sync(self, user_id: str) -> list[str]:
        with self.account_service.engine.connect() as connection:
            rows = connection.execute(select(self.orders.c.ticker).where(
                self.orders.c.user_id == user_id,
                self.orders.c.status == "pending",
            )).all()
        return list(dict.fromkeys(str(row.ticker) for row in rows))

    async def process_observation(
        self,
        user_id: str,
        ticker: str,
        candle: Candle,
    ) -> None:
        await self.start()
        await asyncio.to_thread(
            self._process_observation_sync,
            user_id,
            ticker.strip().upper().removesuffix(".TO"),
            candle,
        )

    def _fill_price(self, row: Any, candle: Candle) -> float | None:
        slip = PAPER_SLIPPAGE_PERCENT / 100
        if row.order_type == "market":
            return candle.open * (1 + slip if row.side == "buy" else 1 - slip)
        if row.order_type == "limit":
            if row.side == "buy" and candle.low <= row.limit_price:
                return min(candle.open, row.limit_price)
            if row.side == "sell" and candle.high >= row.limit_price:
                return max(candle.open, row.limit_price)
            return None
        if row.order_type == "stop":
            if row.side == "buy" and candle.high >= row.stop_price:
                return max(candle.open, row.stop_price) * (1 + slip)
            if row.side == "sell" and candle.low <= row.stop_price:
                return min(candle.open, row.stop_price) * (1 - slip)
            return None
        if not row.activated:
            return None
        if row.side == "buy" and candle.low <= row.limit_price:
            return min(candle.open, row.limit_price)
        if row.side == "sell" and candle.high >= row.limit_price:
            return max(candle.open, row.limit_price)
        return None

    def _process_observation_sync(
        self,
        user_id: str,
        ticker: str,
        candle: Candle,
    ) -> None:
        observed = datetime.fromtimestamp(candle.time, UTC)
        with self.account_service.engine.begin() as connection:
            account = self._ensure_account_sync(connection, user_id)
            rows = connection.execute(select(self.orders).where(
                self.orders.c.user_id == user_id,
                self.orders.c.ticker == ticker,
                self.orders.c.status == "pending",
            ).order_by(self.orders.c.created_at)).mappings().all()
            cash = float(account.cash)
            commission = float(account.commission)
            for row in rows:
                submitted = _datetime(row.submitted_market_time)
                if submitted is None or observed <= submitted:
                    continue
                if row.order_type == "stop_limit" and not row.activated:
                    triggered = (
                        row.side == "buy" and candle.high >= row.stop_price
                    ) or (
                        row.side == "sell" and candle.low <= row.stop_price
                    )
                    if triggered:
                        connection.execute(update(self.orders).where(
                            self.orders.c.id == row.id,
                            self.orders.c.user_id == user_id,
                        ).values(
                            activated=True,
                            activated_at=_iso(observed),
                        ))
                        self._audit(
                            connection,
                            user_id,
                            "stop_activated",
                            "Stop atteint; la limite sera évaluée à partir de la prochaine observation.",
                            row.id,
                        )
                    continue
                activated_at = _datetime(row.activated_at)
                if activated_at is not None and observed <= activated_at:
                    continue
                fill = self._fill_price(row, candle)
                if fill is None:
                    continue
                position_id = f"{user_id}:{ticker}"
                position = connection.execute(select(self.positions).where(
                    self.positions.c.id == position_id,
                    self.positions.c.user_id == user_id,
                )).mappings().first()
                realized = 0.0
                notional = float(row.quantity) * fill
                rejection: str | None = None
                if row.side == "buy":
                    required = notional + commission
                    if cash < required:
                        rejection = "Capital PAPER insuffisant au moment du fill."
                    else:
                        cash -= required
                        old_quantity = float(position.quantity) if position else 0.0
                        old_cost = float(position.average_cost) if position else 0.0
                        quantity = old_quantity + float(row.quantity)
                        average = (
                            old_quantity * old_cost + notional
                        ) / quantity
                        values = {
                            "id": position_id,
                            "user_id": user_id,
                            "ticker": ticker,
                            "quantity": quantity,
                            "average_cost": average,
                            "realized_pnl": float(position.realized_pnl) if position else 0.0,
                            "updated_at": _iso(observed),
                        }
                        if position:
                            connection.execute(update(self.positions).where(
                                self.positions.c.id == position_id,
                                self.positions.c.user_id == user_id,
                            ).values(**{
                                key: value for key, value in values.items()
                                if key not in {"id", "user_id"}
                            }))
                        else:
                            connection.execute(insert(self.positions).values(**values))
                else:
                    available = float(position.quantity) if position else 0.0
                    if available + 1e-9 < float(row.quantity):
                        rejection = "Position PAPER insuffisante au moment du fill."
                    else:
                        cash += notional - commission
                        realized = (
                            (fill - float(position.average_cost)) * float(row.quantity)
                            - commission
                        )
                        remaining = available - float(row.quantity)
                        if remaining <= 1e-9:
                            connection.execute(delete(self.positions).where(
                                self.positions.c.id == position_id,
                                self.positions.c.user_id == user_id,
                            ))
                        else:
                            connection.execute(update(self.positions).where(
                                self.positions.c.id == position_id,
                                self.positions.c.user_id == user_id,
                            ).values(
                                quantity=remaining,
                                realized_pnl=float(position.realized_pnl) + realized,
                                updated_at=_iso(observed),
                            ))
                if rejection:
                    connection.execute(update(self.orders).where(
                        self.orders.c.id == row.id,
                        self.orders.c.user_id == user_id,
                    ).values(status="rejected", rejection_reason=rejection))
                    self._audit(connection, user_id, "order_rejected", rejection, row.id)
                    continue
                trade_id = str(uuid.uuid4())
                connection.execute(insert(self.trades).values(
                    id=trade_id,
                    user_id=user_id,
                    order_id=row.id,
                    ticker=ticker,
                    side=row.side,
                    quantity=row.quantity,
                    price=fill,
                    notional=notional,
                    commission=commission,
                    realized_pnl=realized,
                    executed_at=_iso(observed),
                ))
                connection.execute(update(self.orders).where(
                    self.orders.c.id == row.id,
                    self.orders.c.user_id == user_id,
                ).values(
                    status="filled",
                    filled_at=_iso(observed),
                    filled_price=fill,
                ))
                self._audit(
                    connection,
                    user_id,
                    "order_filled",
                    f"Fill PAPER {row.side} {row.quantity:g} {ticker} à {fill:.4f}.",
                    row.id,
                )
            connection.execute(update(self.accounts).where(
                self.accounts.c.user_id == user_id,
            ).values(cash=cash, updated_at=_iso(_now())))

    async def get_account(self, user_id: str) -> PaperAccount:
        await self.start()
        account, positions, orders, trades = await asyncio.to_thread(
            self._account_rows_sync,
            user_id,
        )
        tickers = [str(row.ticker) for row in positions]
        quotes = await market_data_service.get_quotes(tickers) if tickers else []
        quote_map = {
            quote.symbol.removesuffix(".TO"): quote.price
            for quote in quotes
        }
        output_positions: list[PaperPosition] = []
        market_value = 0.0
        for row in positions:
            current = quote_map.get(str(row.ticker), float(row.average_cost))
            value = float(row.quantity) * current
            cost = float(row.quantity) * float(row.average_cost)
            unrealized = value - cost
            market_value += value
            output_positions.append(PaperPosition(
                ticker=row.ticker,
                quantity=round(float(row.quantity), 6),
                average_cost=round(float(row.average_cost), 4),
                current_price=round(current, 4),
                market_value=round(value, 2),
                unrealized_pnl=round(unrealized, 2),
                unrealized_pnl_percent=round(
                    unrealized / cost * 100 if cost else 0,
                    4,
                ),
                realized_pnl=round(float(row.realized_pnl), 2),
            ))
        equity = float(account.cash) + market_value
        total_return = equity - float(account.initial_capital)
        return PaperAccount(
            initial_capital=round(float(account.initial_capital), 2),
            cash=round(float(account.cash), 2),
            equity=round(equity, 2),
            buying_power=round(float(account.cash), 2),
            market_value=round(market_value, 2),
            total_return=round(total_return, 2),
            total_return_percent=round(
                total_return / float(account.initial_capital) * 100,
                4,
            ),
            commission=round(float(account.commission), 2),
            positions=output_positions,
            orders=[self._order(dict(row)) for row in orders],
            trades=[self._trade(dict(row)) for row in trades],
            updated_at=_datetime(account.updated_at) or _now(),
        )

    def _account_rows_sync(
        self,
        user_id: str,
    ) -> tuple[Any, list[Any], list[Any], list[Any]]:
        with self.account_service.engine.begin() as connection:
            account = self._ensure_account_sync(connection, user_id)
            positions = connection.execute(select(self.positions).where(
                self.positions.c.user_id == user_id,
            ).order_by(self.positions.c.ticker)).mappings().all()
            orders = connection.execute(select(self.orders).where(
                self.orders.c.user_id == user_id,
            ).order_by(self.orders.c.created_at.desc()).limit(100)).mappings().all()
            trades = connection.execute(select(self.trades).where(
                self.trades.c.user_id == user_id,
            ).order_by(self.trades.c.executed_at.desc()).limit(200)).mappings().all()
        return account, positions, orders, trades

    async def reset(
        self,
        user_id: str,
        request: PaperResetRequest,
    ) -> PaperAccount:
        await self.start()
        await asyncio.to_thread(self._reset_sync, user_id, request)
        return await self.get_account(user_id)

    def _reset_sync(self, user_id: str, request: PaperResetRequest) -> None:
        now = _iso(_now())
        with self.account_service.engine.begin() as connection:
            for table in (self.orders, self.positions, self.trades, self.audit):
                connection.execute(delete(table).where(table.c.user_id == user_id))
            existing = connection.execute(select(self.accounts.c.user_id).where(
                self.accounts.c.user_id == user_id,
            )).first()
            values = {
                "initial_capital": request.initial_capital,
                "cash": request.initial_capital,
                "commission": request.commission,
                "updated_at": now,
            }
            if existing:
                connection.execute(update(self.accounts).where(
                    self.accounts.c.user_id == user_id,
                ).values(**values))
            else:
                connection.execute(insert(self.accounts).values(
                    user_id=user_id,
                    created_at=now,
                    **values,
                ))
            self._audit(
                connection,
                user_id,
                "account_reset",
                f"Compte PAPER réinitialisé à {request.initial_capital:.2f} CAD.",
            )

    async def audit_log(
        self,
        user_id: str,
        *,
        limit: int = 100,
    ) -> list[PaperAuditEvent]:
        await self.start()
        rows = await asyncio.to_thread(
            self._audit_rows_sync,
            user_id,
            limit,
        )
        return [PaperAuditEvent(
            id=row.id,
            action=row.action,
            entity_id=row.entity_id,
            detail=row.detail,
            created_at=_datetime(row.created_at) or _now(),
        ) for row in rows]

    def _audit_rows_sync(self, user_id: str, limit: int) -> list[Any]:
        with self.account_service.engine.connect() as connection:
            return list(connection.execute(select(self.audit).where(
                self.audit.c.user_id == user_id,
            ).order_by(self.audit.c.created_at.desc()).limit(
                max(1, min(limit, 200))
            )).mappings().all())

    async def delete_user_data(self, user_id: str) -> None:
        await self.start()
        await asyncio.to_thread(self._delete_user_data_sync, user_id)

    def _delete_user_data_sync(self, user_id: str) -> None:
        with self.account_service.engine.begin() as connection:
            for table in (
                self.audit,
                self.trades,
                self.orders,
                self.positions,
                self.accounts,
            ):
                connection.execute(delete(table).where(table.c.user_id == user_id))

    @staticmethod
    def _order(row: dict[str, Any]) -> PaperOrder:
        return PaperOrder(
            id=row["id"],
            ticker=row["ticker"],
            order_type=row["order_type"],
            side=row["side"],
            quantity=float(row["quantity"]),
            limit_price=row.get("limit_price"),
            stop_price=row.get("stop_price"),
            status=row["status"],
            submitted_market_time=(
                _datetime(row.get("submitted_market_time")) or _now()
            ),
            created_at=_datetime(row.get("created_at")) or _now(),
            activated_at=_datetime(row.get("activated_at")),
            filled_at=_datetime(row.get("filled_at")),
            filled_price=row.get("filled_price"),
            cancelled_at=_datetime(row.get("cancelled_at")),
            rejection_reason=row.get("rejection_reason"),
        )

    @staticmethod
    def _trade(row: dict[str, Any]) -> PaperTrade:
        return PaperTrade(
            id=row["id"],
            order_id=row["order_id"],
            ticker=row["ticker"],
            side=row["side"],
            quantity=float(row["quantity"]),
            price=float(row["price"]),
            notional=float(row["notional"]),
            commission=float(row["commission"]),
            realized_pnl=float(row["realized_pnl"]),
            executed_at=_datetime(row.get("executed_at")) or _now(),
        )


paper_trading_service = PaperTradingService()
