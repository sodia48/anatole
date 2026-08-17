import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.market_data import market_data_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/quotes/{ticker}")
async def quote_stream(websocket: WebSocket, ticker: str) -> None:
    await websocket.accept()
    failures = 0

    try:
        while True:
            try:
                quote = await market_data_service.get_quote(ticker)
                await websocket.send_json(quote.model_dump(mode="json"))
                failures = 0
                # Le cache quote est partagé : 15 s reste fluide sans requêter
                # Yahoo toutes les 5 s pour chaque utilisateur connecté.
                await asyncio.sleep(15)
            except asyncio.CancelledError:
                raise
            except WebSocketDisconnect:
                return
            except Exception as error:  # noqa: BLE001
                failures += 1
                logger.warning(
                    "quote_websocket_retry ticker=%s failure=%s error=%s",
                    ticker,
                    failures,
                    type(error).__name__,
                )
                if failures >= 4:
                    await websocket.close(code=1011)
                    return
                await asyncio.sleep(min(5 * failures, 20))
    except WebSocketDisconnect:
        return
