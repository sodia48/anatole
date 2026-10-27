"""Realistic public-release regressions for News Reader 3.0."""
import asyncio
import json
from collections import Counter
from datetime import datetime, UTC
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.discovery import NewsBriefRequest
from app.services.news_brief import NewsBriefService
from app.services.news_brief import _same_source_story
from app.services.stock_news import StockNewsService, _parse_five_n_releases
from app.services import news_brief as brief_module


FIVE_N_RELEASE = """5N Plus inc. annoncera ses résultats du troisième trimestre de l'exercice financier 2026 le 2 novembre 2026
26 octobre 2026 | Montréal (Québec)
5N Plus inc. (TSX : VNP) annoncera ses résultats du troisième trimestre 2026, le lundi 2 novembre 2026 après la fermeture des marchés et une conférence téléphonique aura lieu le mardi 3 novembre 2026 avec les analystes pour discuter des résultats.
Conférence téléphonique - résultats T3 2026 :
Mardi 3 novembre 2026 à 8h (heure de l'Est)
Visiter la section Investisseurs à www.5nplus.com pour accéder à la webdiffusion
Composer le 1 800 990-4777 (sans frais), le 1 289 819-1299 (Toronto) ou le 1 514 400-3794 (Montréal)
Numéro de la conférence est le 04970
Un enregistrement sera disponible deux heures après l'événement au 1 888 660-6345 jusqu'au 10 novembre 2026. Le code d'accès est 04970.
À propos de 5N+
5N+ est un chef de file mondial dans la production de semiconducteurs spécialisés et de matériaux de haute performance.
"""


def request(**updates) -> NewsBriefRequest:
    data = {
        "title": "5N Plus Inc. to Release Third Quarter 2026 Results on November 2, 2026",
        "summary": "",
        "url": "https://www.5nplus.com/fr/nouvelles/5n-plus-inc-annoncera-ses-resultats-T3-2026/",
        "source": "5N Plus",
        "category": "stock",
        "region": "Canada",
        "language": "fr",
        "context": "stock",
        "ticker": "VNP.TO",
        "company": "5N Plus Inc.",
        "published_at": datetime(2026, 10, 26, tzinfo=UTC),
    }
    data.update(updates)
    return NewsBriefRequest(**data)


def test_five_n_schedule_has_distinct_dates_and_no_invented_results() -> None:
    brief = NewsBriefService().build_from_text(request(), FIVE_N_RELEASE, source_mode="article_page")
    assert brief.article is not None
    assert brief.article.kind == "results_schedule"
    assert brief.article.coverage == "structured"
    assert len(brief.article.events) == 2
    release, conference = brief.article.events
    assert brief.article.published_at.date().isoformat() == "2026-10-26"
    assert release.starts_at.date().isoformat() == "2026-11-02"
    assert release.timing == "after_close"
    assert conference.starts_at.isoformat() == "2026-11-03T08:00:00-05:00"
    assert conference.phone_numbers == ["1 800 990-4777", "1 289 819-1299", "1 514 400-3794"]
    assert conference.access_code == "04970"
    assert conference.replay_until.date().isoformat() == "2026-11-10"
    assert "2 novembre 2026 après la clôture" in brief.article.facts[0]
    assert "3 novembre 2026 à 8 h" in brief.article.facts[1]
    assert "2 novembre" in brief.summary and "3 novembre" in brief.summary
    assert "résultats financiers ne figurent pas" in brief.article.limitations[0]
    assert brief.key_figures == []
    assert brief.figure_series == []
    assert "revenu" not in brief.summary.lower()


def test_5n_http_endpoint_preserves_reader_contract(monkeypatch) -> None:
    async def page(self, url: str, context: str = "macro") -> str:
        return FIVE_N_RELEASE

    monkeypatch.setattr(NewsBriefService, "_fetch_text", page)
    response = TestClient(app).post("/api/v1/discovery/news/brief", json=request().model_dump(mode="json"))
    assert response.status_code == 200
    payload = response.json()
    assert payload["article"]["kind"] == "results_schedule"
    assert payload["article"]["events"][0]["kind"] == "results_scheduled"
    assert payload["key_figures"] == []


def test_schedule_from_excerpt_is_not_presented_as_full_article() -> None:
    brief = NewsBriefService().build_from_text(request(summary=FIVE_N_RELEASE.splitlines()[2]),
                                                FIVE_N_RELEASE.splitlines()[2], source_mode="feed_summary")
    assert brief.article.coverage == "excerpt"
    assert brief.article.kind == "results_schedule"
    assert len(brief.article.events) >= 1
    assert any("Contenu limité" in limit for limit in brief.article.limitations)


def test_published_results_keep_financial_figures() -> None:
    article = "5N Plus announced third-quarter results. Revenue was USD 122.4 million. EPS was USD 0.45."
    brief = NewsBriefService().build_from_text(request(title="5N Plus announces third-quarter results",
        language="en"), article, source_mode="article_page")
    assert brief.article.kind == "results_report"
    assert any("122.4" in figure.value for figure in brief.key_figures)


def test_dividend_and_acquisition_are_not_results_schedules() -> None:
    for title, expected in [("Royal Bank declares dividend", "dividend"),
                            ("Royal Bank announces acquisition", "acquisition")]:
        brief = NewsBriefService().build_from_text(request(title=title, company="Royal Bank"),
            "Royal Bank announced a transaction on November 2, 2026.", source_mode="article_page")
        assert brief.article.kind == expected
        assert not any(event.kind == "results_scheduled" for event in brief.article.events)


def test_unavailable_source_falls_back_to_excerpt(monkeypatch) -> None:
    async def unavailable(self, url: str, context: str = "macro") -> str:
        raise TimeoutError("source down")

    monkeypatch.setattr(NewsBriefService, "_fetch_text", unavailable)
    brief = asyncio.run(NewsBriefService()._load(request(summary="5N Plus will release Q3 results on November 2, 2026.")))
    assert brief.article.coverage == "excerpt"
    assert brief.availability == "publisher_excerpt"


def test_french_official_index_preserves_verified_release_identity() -> None:
    page = '''<div class="news-list__list-el"><div class="news-list__info"><strong>26 octobre 2026 | Montréal</strong></div>
      <div class="news-list__title"><h2><a href="/fr/nouvelles/5n-plus-inc-annoncera-ses-resultats-T3-2026/">5N Plus inc. annoncera ses résultats du troisième trimestre 2026 le 2 novembre 2026</a></h2></div>
      <div class="news-list__text"><p>5N Plus publiera ses résultats après la clôture.</p></div></div>'''
    releases = _parse_five_n_releases(page, "VNP.TO", "fr")
    assert len(releases) == 1
    assert releases[0].published_at.date().isoformat() == "2026-10-26"
    assert releases[0].url == request().url


def test_yahoo_release_resolves_to_matching_french_official_version(monkeypatch) -> None:
    page = '''<div class="news-list__list-el"><div class="news-list__info"><strong>26 octobre 2026 | Montréal</strong></div>
      <div class="news-list__title"><h2><a href="/fr/nouvelles/5n-plus-inc-annoncera-ses-resultats-T3-2026/">5N Plus inc. annoncera ses résultats du troisième trimestre de l'exercice financier 2026 le 2 novembre 2026</a></h2></div>
      <div class="news-list__text"><p>5N Plus publiera ses résultats après la clôture.</p></div></div>'''
    official = _parse_five_n_releases(page, "VNP.TO", "fr")

    async def french_index(symbol: str):
        return official

    async def fetched(self, url: str, context: str = "stock"):
        assert url == official[0].url
        return FIVE_N_RELEASE

    monkeypatch.setattr(StockNewsService, "_company_releases_fr", french_index)
    monkeypatch.setattr(NewsBriefService, "_fetch_text", fetched)
    original = request(url="https://www.newswire.ca/news-releases/5n-plus-to-release-q3-results-2026.html",
                       source="CNW")
    brief = asyncio.run(NewsBriefService()._load(original))
    assert brief.source_url == official[0].url
    assert brief.article.original_url == original.url
    assert brief.article.alternate_sources[0].url == original.url
    assert brief.article.events[0].starts_at.date().isoformat() == "2026-11-02"


def test_french_and_english_company_versions_keep_alternate_link() -> None:
    def card(date: str, title: str, url: str) -> str:
        return (f'<div class="news-list__list-el"><div class="news-list__info"><strong>{date}</strong></div>'
                f'<div class="news-list__title"><h2><a href="{url}">{title}</a></h2></div>'
                '<div class="news-list__text"><p>The company will publish results after market close.</p></div></div>')

    french = _parse_five_n_releases(card("26 octobre 2026 | Montréal",
        "5N Plus inc. annoncera ses résultats du troisième trimestre 2026 le 2 novembre 2026",
        "/fr/nouvelles/5n-plus-inc-annoncera-ses-resultats-T3-2026/"), "VNP.TO", "fr")
    english = _parse_five_n_releases(card("October 26, 2026 | Montréal",
        "5N Plus Inc. to Release Third Quarter 2026 Results on November 2, 2026",
        "/en/news/5n-plus-to-release-third-quarter-2026-results/"), "VNP.TO")
    selected = StockNewsService._rank_and_select([*french, *english], Counter())
    assert len(selected) == 1
    assert selected[0].url == french[0].url
    assert [source.url for source in selected[0].related_sources] == [english[0].url]


def test_different_company_or_date_cannot_be_resolved_as_same_release(monkeypatch) -> None:
    page = '''<div class="news-list__list-el"><div class="news-list__info"><strong>26 octobre 2026 | Montréal</strong></div>
      <div class="news-list__title"><h2><a href="/fr/nouvelles/5n-plus-inc-annoncera-ses-resultats-T3-2026/">5N Plus inc. annoncera ses résultats du troisième trimestre de l'exercice financier 2026 le 2 novembre 2026</a></h2></div>
      <div class="news-list__text"><p>5N Plus publiera ses résultats après la clôture.</p></div></div>'''
    official = _parse_five_n_releases(page, "VNP.TO", "fr")

    async def french_index(symbol: str):
        return official

    async def inaccessible(self, url: str, context: str = "stock"):
        raise TimeoutError()

    monkeypatch.setattr(StockNewsService, "_company_releases_fr", french_index)
    monkeypatch.setattr(NewsBriefService, "_fetch_text", inaccessible)
    wrong = request(company="Unrelated Company", url="https://www.newswire.ca/5n",
                    summary="Unrelated Company will publish results on November 2, 2026.")
    brief = asyncio.run(NewsBriefService()._load(wrong))
    assert brief.source_url == wrong.url
    assert brief.article.coverage == "excerpt"


def test_same_company_and_date_do_not_merge_different_events() -> None:
    base = request(title="5N Plus announces dividend on November 2, 2026")
    assert not _same_source_story(base, "5N Plus announces acquisition on November 2, 2026")
    schedule = request(title="5N Plus to release third-quarter results on November 2, 2026")
    assert not _same_source_story(schedule, "5N Plus reports third-quarter results on November 2, 2026")


def test_translation_rejects_changed_month_with_same_numbers(monkeypatch) -> None:
    source = "The company announced that the conference call is scheduled for November 3, 2026."
    brief = NewsBriefService().build_from_text(request(title="5N Plus conference call", summary=source),
                                               source, source_mode="feed_summary")
    assert brief.translation_status == "unavailable"
    monkeypatch.setattr(brief_module.provider_router, "available", lambda: [object()])

    async def translated(*, prompt: str, **kwargs):
        values = json.loads(prompt.split("Input: ", 1)[1])
        values[0] = "La conférence téléphonique est prévue le 3 décembre 2026."
        return SimpleNamespace(success=True, answer=json.dumps({"texts": values}))

    monkeypatch.setattr(brief_module.provider_router, "generate_internal_evidence", translated)
    assert asyncio.run(NewsBriefService()._translate(brief, "fr")).translation_status == "unavailable"
