from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services.assistant import AssistantService, analysis_service, market_data_service


@pytest.mark.asyncio
async def test_assistant_rejects_demo_fallback_quote_outside_demo_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "yahoo"

    async def focus(*_args, **_kwargs):
        return SimpleNamespace(quote=SimpleNamespace(source="demo-fallback"))

    monkeypatch.setattr(market_data_service, "get_focus_snapshot", focus)
    try:
        response = await AssistantService()._ticker("RY")
    finally:
        settings.market_data_provider = original
    assert response.answer == "Je n’ai pas suffisamment de données sourcées pour répondre."
    assert response.facts == []


@pytest.mark.asyncio
async def test_comparator_source_wording_promises_only_strict_available_history(monkeypatch: pytest.MonkeyPatch) -> None:
    instrument = SimpleNamespace(symbol="RY", score=70.0, total_return_percent=5.0, volatility_percent=12.0)

    async def compare(_request):
        return SimpleNamespace(instruments=[instrument], methodology="Historique strict")

    monkeypatch.setattr(analysis_service, "compare", compare)
    response = await AssistantService()._compare(["RY", "TD"])
    details = [source.detail for source in response.sources]
    assert "Historiques publics stricts réellement disponibles." in details
    assert all("données de secours" not in detail for detail in details)
    assert response.links[0].href.startswith("/comparateur")
