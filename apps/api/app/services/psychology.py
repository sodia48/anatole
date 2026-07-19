import asyncio
import math
from datetime import UTC, datetime
from statistics import pstdev
from time import monotonic

from app.schemas.discovery import PsychologyComponent, PsychologySnapshot
from app.services.cockpit import cockpit_service
from app.services.market_data import market_data_service


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def _change(closes: list[float], sessions: int) -> float:
    if len(closes) <= sessions or closes[-sessions - 1] == 0:
        return 0.0
    return (closes[-1] / closes[-sessions - 1] - 1) * 100


def _label(score: float) -> str:
    if score < 20:
        return "Peur extrême"
    if score < 40:
        return "Peur"
    if score < 60:
        return "Neutre"
    if score < 80:
        return "Confiance"
    return "Confiance extrême"


class PsychologyService:
    cache_ttl_seconds = 45.0

    def __init__(self) -> None:
        self._cached: PsychologySnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_snapshot(self) -> PsychologySnapshot:
        now = monotonic()
        if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
            return self._cached
        async with self._lock:
            now = monotonic()
            if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
                return self._cached

            cockpit, history = await asyncio.gather(
                cockpit_service.get_tsx60(),
                market_data_service.get_history("^GSPTSE", range_="1y", interval="1d"),
            )
            closes = [item.close for item in history]
            returns = [closes[index] / closes[index - 1] - 1 for index in range(1, len(closes)) if closes[index - 1]]
            recent_returns = returns[-20:]
            volatility_20d = pstdev(recent_returns) * math.sqrt(252) * 100 if len(recent_returns) >= 2 else 0.0
            change_20d = _change(closes, 20)
            change_50d = _change(closes, 50)
            technicals = market_data_service.calculate_technicals(history)

            breadth_score = _clamp(cockpit.breadth.advance_ratio)
            momentum_score = _clamp(50 + change_20d * 3.0 + change_50d * 1.25)
            volatility_score = _clamp(100 - max(volatility_20d - 8, 0) * 3.2)
            trend_score = {"Haussière": 82.0, "Mixte": 52.0, "Baissière": 24.0}.get(technicals.trend, 45.0)
            sector_positive = sum(sector.change_percent > 0 for sector in cockpit.sectors)
            leadership_score = _clamp(sector_positive / max(len(cockpit.sectors), 1) * 100)

            score = round(breadth_score * 0.28 + momentum_score * 0.28 + volatility_score * 0.18 + trend_score * 0.16 + leadership_score * 0.10, 1)
            components = [
                PsychologyComponent(key="breadth", label="Largeur du marché", score=round(breadth_score, 1), description=f"{cockpit.breadth.advancers} hausses contre {cockpit.breadth.decliners} baisses dans le TSX 60."),
                PsychologyComponent(key="momentum", label="Momentum de l’indice", score=round(momentum_score, 1), description=f"Variation sur 20 séances : {change_20d:+.2f} %; sur 50 séances : {change_50d:+.2f} %."),
                PsychologyComponent(key="volatility", label="Volatilité", score=round(volatility_score, 1), description=f"Volatilité annualisée sur 20 séances : {volatility_20d:.1f} %."),
                PsychologyComponent(key="trend", label="Tendance", score=round(trend_score, 1), description=f"Lecture technique du S&P/TSX Composite : {technicals.trend.lower()}."),
                PsychologyComponent(key="leadership", label="Leadership sectoriel", score=round(leadership_score, 1), description=f"{sector_positive} secteurs sur {len(cockpit.sectors)} progressent."),
            ]
            snapshot = PsychologySnapshot(score=score, label=_label(score), change_20d=round(change_20d, 2), change_50d=round(change_50d, 2), volatility_20d=round(volatility_20d, 2), advance_ratio=round(cockpit.breadth.advance_ratio, 2), components=components, generated_at=datetime.now(UTC), refresh_after_seconds=45, source="S&P/TSX Composite + largeur du TSX 60")
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot


psychology_service = PsychologyService()
