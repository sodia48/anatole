import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.market_data import market_data_service

router = APIRouter()


@router.websocket("/quotes/{ticker}")
async def quote_stream(websocket: WebSocket, ticker: str) -> None:
    await websocket.accept()
    try:
        while True:
            quote = await market_data_service.get_quote(ticker)
            await websocket.send_json(quote.model_dump(mode="json"))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        return
    except Exception:
        await websocket.close(code=1011)
