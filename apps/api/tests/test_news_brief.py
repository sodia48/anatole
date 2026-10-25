import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.discovery import NewsBriefRequest
from app.services.news_brief import NewsBriefService
from app.services import news_brief as brief_module


def make_request(**updates):
    values = {
        "title": "Approvisionnement et utilisation de gaz naturel, juillet 2026",
        "summary": "Les données de juillet sur le gaz naturel sont maintenant disponibles.",
        "url": "https://www150.statcan.gc.ca/example",
        "source": "Statistique Canada",
        "category": "Énergie",
        "region": "Canada",
        "language": "fr",
    }
    values.update(updates)
    return NewsBriefRequest(**values)


def test_brief_extracts_facts_figures_and_changes() -> None:
    service = NewsBriefService()
    article = """
    La production de gaz naturel commercialisable a atteint 18,4 milliards de mètres cubes en juillet.
    Les livraisons aux consommateurs ont augmenté de 4,2 % par rapport à juillet 2025.
    Les stocks se sont établis à 27,1 milliards de mètres cubes, en hausse de 2,0 % sur un an.
    """
    brief = service.build_from_text(make_request(), article, source_mode="official_page")
    assert brief.source_mode == "official_page"
    assert "18,4" in brief.summary or "4,2" in brief.summary
    assert brief.key_figures
    assert any("4,2" in figure.value for figure in brief.key_figures)
    assert brief.changes
    assert brief.availability == "article"
    assert brief.why_it_matters == ""  # No causal claim in the publication.


def test_brief_fallback_is_explicit() -> None:
    service = NewsBriefService()
    brief = service.build_from_text(
        make_request(summary="La publication présente les données mensuelles de juillet."),
        "La publication présente les données mensuelles de juillet.",
        source_mode="feed_summary",
    )
    assert brief.source_mode == "feed_summary"
    assert "extrait" in brief.source_note.lower()
    assert brief.availability == "publisher_excerpt"
    assert brief.watch == []  # No future event was stated in the excerpt.


def test_official_allowlist_blocks_arbitrary_hosts() -> None:
    service = NewsBriefService()
    assert service._allowed("https://www150.statcan.gc.ca/n1/test") is True
    assert service._allowed("https://www.bankofcanada.ca/test") is True
    assert service._allowed("http://127.0.0.1:8000/private") is False
    assert service._allowed("https://example.com/article") is False
    assert service._allowed("https://www150.statcan.gc.ca:8443/private") is False
    assert service._allowed("https://www150.statcan.gc.ca.evil.example/private") is False
    assert service._allowed("https://user@www150.statcan.gc.ca/private") is False
    assert service._allowed("https://newswire.ca/release", "stock") is True
    assert service._allowed("https://newswire.ca/release", "macro") is False


def test_stock_brief_separates_actual_forecast_and_other_companies() -> None:
    request = make_request(
        title="Royal Bank of Canada and TD report quarterly results",
        summary="",
        context="stock",
        ticker="RY.TO",
        company="Royal Bank of Canada",
        related_tickers=["RY.TO", "TD.TO"],
        category="earnings",
    )
    article = (
        "Royal Bank of Canada reported revenue of $18.4 billion for the quarter. "
        "Revenue increased 4.2% from the prior year. "
        "Management forecasts revenue of $19 billion for next quarter. "
        "TD also reported quarterly results. "
        "The company will publish its next earnings release on November 21."
    )
    brief = NewsBriefService().build_from_text(request, article, source_mode="article_page")
    assert brief.relevance == "direct"
    assert brief.availability == "article"
    assert any(item.kind == "actual" for item in brief.key_figures)
    assert any(item.kind == "forecast" for item in brief.key_figures)
    assert any(item.kind == "date" and "November 21" in item.value for item in brief.key_figures)
    assert brief.why_it_matters == ""  # Joint story is not solely attributable to RY.
    assert brief.watch and "November 21" in brief.watch[0]
    assert all("buy" not in value.lower() for value in [brief.summary, brief.why_it_matters])


def test_generic_ticker_word_is_not_company_evidence() -> None:
    request = make_request(
        title="The RY climate forum reviews bank sector risks",
        summary="Banks could face more climate disclosure requirements.",
        context="stock", ticker="RY", company="Royal Bank of Canada",
        related_tickers=[],
    )
    brief = NewsBriefService().build_from_text(
        request, request.summary, source_mode="feed_summary",
    )
    assert brief.relevance == "unclear"
    assert brief.why_it_matters == ""


def test_title_only_has_no_invented_figures_or_watch() -> None:
    request = make_request(
        title="Royal Bank of Canada announces an update",
        summary="", context="stock", ticker="RY", company="Royal Bank of Canada",
    )
    brief = NewsBriefService().build_from_text(request, request.title, source_mode="title_only")
    assert brief.availability == "limited"
    assert brief.key_figures == []
    assert brief.watch == []
    assert brief.detail_available is False
    assert "titre" in brief.source_note


def test_unavailable_english_translation_is_disclosed() -> None:
    request = make_request(
        title="Royal Bank of Canada earnings",
        summary="The bank reported revenue of $18.4 billion and shares rose 4.2%.",
        language="fr", context="stock", ticker="RY", company="Royal Bank of Canada",
    )
    brief = NewsBriefService().build_from_text(
        request, request.summary, source_mode="feed_summary",
    )
    assert brief.source_language == "en"
    assert brief.translation_status == "unavailable"
    assert "traduction fiable indisponible" in brief.source_note


def test_translation_preserves_numbers_and_rejects_invented_ones(monkeypatch: pytest.MonkeyPatch) -> None:
    request = make_request(
        title="Royal Bank of Canada earnings",
        summary="The bank reported revenue of $18.4 billion and shares rose 4.2%.",
        language="fr", context="stock", ticker="RY", company="Royal Bank of Canada",
    )
    service = NewsBriefService()
    brief = service.build_from_text(request, request.summary, source_mode="feed_summary")
    monkeypatch.setattr(brief_module.provider_router, "available", lambda: [object()])

    async def translate(*, prompt: str, **kwargs):
        source = json.loads(prompt.split("Input: ", 1)[1])
        return SimpleNamespace(success=True, answer=json.dumps({
            "texts": ["La banque a déclaré des revenus de $18.4 milliards et ses actions ont augmenté de 4.2%.",
                      *source[1:]],
        }))

    monkeypatch.setattr(brief_module.provider_router, "generate_internal_evidence", translate)
    translated = asyncio.run(service._translate(brief, "fr"))
    assert translated.translation_status == "automatic"
    assert translated.summary.startswith("La banque")

    async def invented(*, prompt: str, **kwargs):
        source = json.loads(prompt.split("Input: ", 1)[1])
        return SimpleNamespace(success=True, answer=json.dumps({
            "texts": ["La banque a déclaré des revenus de $99 milliards.", *source[1:]],
        }))

    monkeypatch.setattr(brief_module.provider_router, "generate_internal_evidence", invented)
    rejected = asyncio.run(service._translate(brief, "fr"))
    assert rejected.translation_status == "unavailable"

    async def changed_scale(*, prompt: str, **kwargs):
        source = json.loads(prompt.split("Input: ", 1)[1])
        return SimpleNamespace(success=True, answer=json.dumps({
            "texts": ["La banque a déclaré des revenus de $18,4 millions et ses actions ont augmenté de 4,2%.",
                      *source[1:]],
        }))

    monkeypatch.setattr(brief_module.provider_router, "generate_internal_evidence", changed_scale)
    assert asyncio.run(service._translate(brief, "fr")).translation_status == "unavailable"


def test_safe_fetch_rejects_redirect_to_unapproved_host(monkeypatch: pytest.MonkeyPatch) -> None:
    original_client = httpx.AsyncClient
    def client(*args, **kwargs):
        return original_client(
            transport=httpx.MockTransport(lambda request: httpx.Response(
                302, headers={"location": "http://127.0.0.1/private"},
            )),
            follow_redirects=False, trust_env=False,
        )
    monkeypatch.setattr(brief_module.httpx, "AsyncClient", client)
    with pytest.raises(ValueError, match="redirect_not_allowed"):
        asyncio.run(NewsBriefService()._fetch_text("https://www150.statcan.gc.ca/story"))


def test_safe_fetch_accepts_bounded_official_article(monkeypatch: pytest.MonkeyPatch) -> None:
    original_client = httpx.AsyncClient
    def client(*args, **kwargs):
        return original_client(
            transport=httpx.MockTransport(lambda request: httpx.Response(
                200, headers={"content-type": "text/html"},
                text="<html><main><p>The bank reported revenue of $18.4 billion.</p>"
                     "<p>Shares rose 4.2% compared with last year.</p></main></html>",
            )),
            follow_redirects=False, trust_env=False,
        )
    monkeypatch.setattr(brief_module.httpx, "AsyncClient", client)
    text = asyncio.run(NewsBriefService()._fetch_text("https://www150.statcan.gc.ca/story"))
    assert "$18.4" in text
    assert "4.2%" in text


def test_generic_access_page_does_not_claim_article_was_consulted(monkeypatch: pytest.MonkeyPatch) -> None:
    service = NewsBriefService()

    async def access_page(url: str, context: str = "macro") -> str:
        return ("Welcome to our publisher website. Sign in to see the latest stories. "
                "Create an account to access more financial news and exclusive coverage. " * 3)

    monkeypatch.setattr(service, "_fetch_text", access_page)
    request = make_request(
        title="Royal Bank quarterly revenue rises",
        summary="Royal Bank reported revenue of $18.4 billion.", context="stock",
        url="https://www.globenewswire.com/news-release/royal-bank",
    )
    brief = asyncio.run(service._load(request))
    assert brief.availability == "publisher_excerpt"
    assert brief.source_mode == "feed_summary"
    assert "18.4" in brief.summary


def test_cache_key_changes_with_excerpt_language_and_company(monkeypatch: pytest.MonkeyPatch) -> None:
    service = NewsBriefService()
    calls = 0
    async def load(request: NewsBriefRequest):
        nonlocal calls
        calls += 1
        return service.build_from_text(request, request.summary, source_mode="feed_summary")
    monkeypatch.setattr(service, "_load", load)
    async def exercise():
        await service.get_brief(make_request(summary="Première version suffisamment longue pour le résumé."))
        await service.get_brief(make_request(summary="Première version suffisamment longue pour le résumé."))
        await service.get_brief(make_request(summary="Seconde version suffisamment longue pour le résumé."))
        await service.get_brief(make_request(summary="Seconde version suffisamment longue pour le résumé.", language="en"))
        await service.get_brief(make_request(summary="Seconde version suffisamment longue pour le résumé.", context="stock", company="RY"))
    asyncio.run(exercise())
    assert calls == 4


def test_legacy_http_endpoint_stays_compatible(monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_fetch(self, url: str, context: str = "macro") -> str:
        return ""
    monkeypatch.setattr(NewsBriefService, "_fetch_text", no_fetch)
    response = TestClient(app).post("/api/v1/discovery/news/brief", json=make_request().model_dump(mode="json"))
    assert response.status_code == 200
    assert response.json()["source_mode"] == "feed_summary"
    assert response.json()["availability"] == "publisher_excerpt"


def test_antimony_forecast_is_grouped_by_year_without_repeated_paragraphs() -> None:
    article = (
        "The global antimony market is forecast to reach USD 4.94 billion in 2025, "
        "USD 5.26 billion in 2026 and USD 6.65 billion by 2030. "
        "A CAGR of 6.6% is expected from 2025 to 2026. "
        "A CAGR of 6.1% is expected from 2026 to 2030."
    )
    brief = NewsBriefService().build_from_text(make_request(
        title="Global antimony market forecast", summary=article, language="en",
    ), article, source_mode="feed_summary")
    market = next(group for group in brief.figure_series if "antimony" in group.label.lower())
    assert [(figure.period, figure.value) for figure in market.figures] == [
        ("2025", "4.94 billion"), ("2026", "5.26 billion"), ("2030", "6.65 billion"),
    ]
    assert all(figure.kind == "forecast" for figure in market.figures)
    assert all("antimony" not in figure.context.lower() or figure.context == article.split(". A CAGR")[0] + "." for figure in market.figures)
    assert all(figure.value not in [row.value for row in brief.key_figures] for figure in market.figures)
    rates = [figure for group in brief.figure_series if "CAGR" in group.label for figure in group.figures]
    assert [(figure.period, figure.value) for figure in rates] == [("2025–2026", "6.6%"), ("2026–2030", "6.1%")]


def test_five_figures_in_one_sentence_do_not_create_five_visible_cards() -> None:
    sentence = "Revenue was $1 million in 2021, $2 million in 2022, $3 million in 2023, $4 million in 2024 and $5 million in 2025."
    brief = NewsBriefService().build_from_text(make_request(title="Revenue forecast", language="en"), sentence, source_mode="feed_summary")
    assert len(brief.figure_series) == 1
    assert len(brief.figure_series[0].figures) == 5
    assert brief.key_figures == []


def test_article_without_numbers_has_no_financial_cards() -> None:
    article = "The company announced a change to its board of directors after its annual meeting."
    brief = NewsBriefService().build_from_text(make_request(language="en"), article, source_mode="feed_summary")
    assert brief.key_figures == []
    assert brief.figure_series == []


def test_translation_accepts_decimal_comma_and_equivalent_billion_unit(monkeypatch: pytest.MonkeyPatch) -> None:
    request = make_request(
        title="Antimony market projection", language="fr",
        summary="The antimony market is projected at USD 4.94 billion in 2025 and USD 5.26 billion in 2026.",
    )
    service = NewsBriefService()
    brief = service.build_from_text(request, request.summary, source_mode="feed_summary")
    assert brief.translation_status == "unavailable"
    monkeypatch.setattr(brief_module.provider_router, "available", lambda: [object()])

    async def translate(*, prompt: str, **kwargs):
        values = json.loads(prompt.split("Input: ", 1)[1])
        values[0] = "Le marché de l'antimoine est estimé à 4,94 milliards USD en 2025 et 5,26 milliards USD en 2026."
        return SimpleNamespace(success=True, answer=json.dumps({"texts": values}))

    monkeypatch.setattr(brief_module.provider_router, "generate_internal_evidence", translate)
    translated = asyncio.run(service._translate(brief, "fr"))
    assert translated.translation_status == "automatic"
    assert "4,94 milliards USD" in translated.summary

    async def wrong_currency(*, prompt: str, **kwargs):
        values = json.loads(prompt.split("Input: ", 1)[1])
        values[0] = "Le marché de l'antimoine est estimé à 4,94 milliards CAD en 2025 et 5,26 milliards USD en 2026."
        return SimpleNamespace(success=True, answer=json.dumps({"texts": values}))

    monkeypatch.setattr(brief_module.provider_router, "generate_internal_evidence", wrong_currency)
    assert asyncio.run(service._translate(brief, "fr")).translation_status == "unavailable"
