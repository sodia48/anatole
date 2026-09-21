from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.discovery import NewsItem
from app.schemas.provincial_macro import (
    ProvincialMacroEvent,
    ProvincialMacroRelease,
    ProvincialMacroSnapshot,
    ProvincialMacroSource,
)
from app.services.provincial_macro import (
    PROVINCES,
    PageSpec,
    ProvincialMacroService,
    _aggregate_release_sources,
    _alberta_calendar_events,
    _british_columbia_calendar_events,
    _dedupe_events,
    _extract_page_release,
    _news_items_to_releases,
    _ontario_calendar_events,
    _province_first_releases,
    _quebec_calendar_events,
    _quebec_general_calendar_events,
    _saskatchewan_calendar_events,
    classify_macro,
    normalize_region,
    provincial_macro_service,
    provincialize_statcan_events,
)


client = TestClient(app)


def test_all_ten_provinces_are_registered() -> None:
    assert set(PROVINCES) == {
        "QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL"
    }


def test_provincial_routes_are_mounted_once_for_all_provinces(monkeypatch) -> None:
    async def fake_snapshot(region: object, lang: str = "fr") -> ProvincialMacroSnapshot:
        code = str(region)
        return ProvincialMacroSnapshot(
            region=code,
            province=PROVINCES[code].fr,
            language="en" if lang == "en" else "fr",
            latest_releases=[],
            upcoming_events=[],
            sources=[],
            generated_at=datetime.now(UTC),
            message="N-D",
        )

    monkeypatch.setattr(
        provincial_macro_service,
        "get_calendar_snapshot",
        fake_snapshot,
    )
    monkeypatch.setattr(
        provincial_macro_service,
        "get_snapshot",
        fake_snapshot,
    )

    for region in PROVINCES:
        calendar = client.get(
            "/api/v1/discovery/provincial-calendar",
            params={"region": region, "lang": "fr"},
        )
        macro = client.get(
            "/api/v1/discovery/provincial-macro",
            params={"region": region, "lang": "fr"},
        )

        assert calendar.status_code == 200
        assert macro.status_code == 200
        assert calendar.json()["region"] == region
        assert macro.json()["region"] == region

    duplicate_prefix = client.get(
        "/api/v1/discovery/api/v1/discovery/provincial-calendar",
        params={"region": "QC", "lang": "fr"},
    )
    assert duplicate_prefix.status_code == 404


def test_region_aliases() -> None:
    assert normalize_region("Québec") == "QC"
    assert normalize_region("Ontario") == "ON"
    assert normalize_region("Colombie-Britannique") == "BC"
    assert normalize_region("Île-du-Prince-Édouard") == "PE"
    assert normalize_region("Terre-Neuve-et-Labrador") == "NL"


def test_noise_is_rejected() -> None:
    assert classify_macro(
        "Avis aux médias - Agenda public de la première ministre du Québec"
    ) == (None, 0)
    assert classify_macro(
        "Mise en garde à la population - présence possible de Listeria"
    ) == (None, 0)
    assert classify_macro(
        "Le gouvernement annonce un investissement dans un centre communautaire"
    ) == (None, 0)


def test_essential_macro_is_kept() -> None:
    category, score = classify_macro(
        "Indice des prix à la consommation : inflation au Québec"
    )
    assert category == "Inflation"
    assert score >= 88

    category, score = classify_macro(
        "Labour Force Survey: employment and unemployment"
    )
    assert category == "Emploi"
    assert score >= 88


def test_static_dashboard_is_not_presented_as_a_publication() -> None:
    spec = PageSpec(
        "ab-dashboard",
        "Alberta Economic Dashboard",
        "dashboard",
        "https://example.test/dashboard",
        "PIB",
    )
    assert _extract_page_release(
        "<h1>Alberta Economic Dashboard</h1><p>GDP and jobs</p>",
        spec=spec,
        region="AB",
        lang="fr",
        base_url=spec.url,
    ) == []


def test_release_source_health_is_grouped_by_provider() -> None:
    sources = [
        ProvincialMacroSource(
            key=f"qc-{index}",
            label="Statistique Québec",
            region="QC",
            kind="statistics",
            url=f"https://example.test/{index}",
            status="available" if index == 0 else "unavailable",
            count=1 if index == 0 else 0,
        )
        for index in range(6)
    ]
    grouped = _aggregate_release_sources(sources, lang="fr")
    assert len(grouped) == 1
    assert grouped[0].label == "Statistique Québec"
    assert grouped[0].status == "partial"
    assert grouped[0].count == 1


def test_official_news_feed_keeps_only_dated_relevant_provincial_releases() -> None:
    now = datetime(2026, 9, 21, 12, tzinfo=UTC)
    items = [
        NewsItem(
            id="statcan-cpi",
            title="Consumer Price Index by province",
            summary="Inflation data include Ontario.",
            url="https://www150.statcan.gc.ca/example",
            source="Statistics Canada",
            category="Inflation",
            published_at=now - timedelta(days=1),
            sentiment="Neutre",
            sentiment_score=0,
            regions=["ON"],
        ),
        NewsItem(
            id="other-region",
            title="Consumer Price Index by province",
            summary="Inflation data include Quebec.",
            url="https://www150.statcan.gc.ca/other",
            source="Statistics Canada",
            category="Inflation",
            published_at=now - timedelta(days=1),
            sentiment="Neutre",
            sentiment_score=0,
            regions=["QC"],
        ),
    ]
    releases = _news_items_to_releases(items, region="ON", lang="fr", now=now)
    assert [release.id for release in releases] == ["news-statcan-cpi"]
    assert releases[0].specificity == "province-normalized"
    assert releases[0].published_at == now - timedelta(days=1)


def test_official_news_feed_keeps_distinct_release_ids_in_query_string() -> None:
    now = datetime(2026, 9, 21, 12, tzinfo=UTC)
    items = [
        NewsItem(
            id=f"alberta-{release_id}",
            title=title,
            summary="Official provincial economic release.",
            url=f"https://www.alberta.ca/announcements.cfm?xID={release_id}",
            source="Gouvernement de l’Alberta",
            category="Investissement",
            published_at=now - timedelta(days=index),
            sentiment="Neutre",
            sentiment_score=0,
            regions=["AB"],
        )
        for index, (release_id, title) in enumerate(
            (("100", "Investment summit"), ("200", "Workforce investment")),
            start=1,
        )
    ]

    releases = _news_items_to_releases(items, region="AB", lang="fr", now=now)

    assert {release.id for release in releases} == {
        "news-alberta-100",
        "news-alberta-200",
    }


def test_quebec_calendar_parser_uses_explicit_next_release_column() -> None:
    html = """
    <table>
      <tr><th>Indicateurs économiques conjoncturels</th><th>Dernières</th><th>Dernière</th><th>Prochaine</th></tr>
      <tr><th></th><th>données</th><th>diffusion</th><th>diffusion</th></tr>
      <tr><td>Comptes économiques trimestriels</td></tr>
      <tr><td>– Québec</td><td>2026-I</td><td>2026-06-26</td><td>2026-09-23</td></tr>
      <tr><td>– Canada</td><td>2026-II</td><td>2026-08-28</td><td>2026-11-30</td></tr>
      <tr><td>PIB réel aux prix de base ($ de 2017)</td></tr>
      <tr><td>– Québec</td><td>mai 2026</td><td>2026-08-25</td><td>2026-09-23</td></tr>
      <tr><td>Exportations et importations internationales réelles de marchandises ($ de 2017)</td></tr>
      <tr><td>– Québec</td><td>juin 2026</td><td>2026-08-18</td><td>2026-09-18</td></tr>
      <tr><td>Mises en chantier (Québec, Canada)</td><td>juillet 2026</td><td>2026-08-18</td><td>2026-09-16</td></tr>
      <tr><td>Permis de bâtir (Québec, Canada)</td><td>juin 2026</td><td>2026-07-10</td><td>2026-09-16</td></tr>
      <tr><td>Ventes de biens fabriqués (Québec, Canada)</td><td>juin 2026</td><td>2026-08-14</td><td>2026-09-14</td></tr>
      <tr><td>Ventes en gros (Québec, Canada)</td><td>juin 2026</td><td>2026-08-14</td><td>2026-09-15</td></tr>
      <tr><td>Ventes au détail (Québec, Canada)</td><td>juin 2026</td><td>2026-08-21</td><td>2026-09-24</td></tr>
      <tr><td>Rémunération hebdomadaire moyenne,</td></tr>
      <tr><td>incluant le temps supplémentaire (Québec, Canada)</td><td>juin 2026</td><td>2026-08-27</td><td>2026-09-24</td></tr>
      <tr><td>Enquête sur la population active (EPA) (Québec, Canada)</td><td>août 2026</td><td>2026-09-04</td><td>2026-09-09</td></tr>
      <tr><td>Indice des prix à la consommation (Québec, Canada)</td><td>juillet 2026</td><td>2026-08-17</td><td>2026-09-14</td></tr>
    </table>
    """
    events = _quebec_calendar_events(
        html,
        now=datetime(2026, 9, 5, 20, tzinfo=UTC),
        lang="fr",
        source_url="https://example.test/qc",
    )
    assert {event.starts_at.date().isoformat() for event in events} == {
        "2026-09-09", "2026-09-14", "2026-09-15", "2026-09-16",
        "2026-09-18", "2026-09-23", "2026-09-24",
    }
    assert len(events) == 11
    assert all(event.region == "QC" for event in events)
    assert all(event.specificity == "province-direct" for event in events)


def test_ontario_calendar_parser_uses_oea_deadline() -> None:
    html = """
    <table>
      <tr><th>Reference Period</th><th>StatsCan</th><th>OEA deadline</th></tr>
      <tr>
        <td>Second quarter (April-June) 2026</td>
        <td>August 28, 2026</td>
        <td>By October 13, 2026</td>
      </tr>
    </table>
    """
    events = _ontario_calendar_events(
        html,
        now=datetime(2026, 8, 16, 20, tzinfo=UTC),
        lang="fr",
        source_url="https://example.test/on",
    )
    assert len(events) == 1
    assert events[0].starts_at.date().isoformat() == "2026-10-13"
    assert events[0].source == "Ontario Economic Accounts"


def test_bc_release_schedule_uses_only_explicit_future_year() -> None:
    html = """
    <h2>Statistics release schedule</h2>
    <h3>2026 release schedule</h3>
    <table>
      <tr><th>2026</th><th>Consumer Price Index</th><th>Labour Force Statistics</th><th>Tourism Room Revenue</th></tr>
      <tr><td>August</td><td>17</td><td>7</td><td>28</td></tr>
      <tr><td>September</td><td>14</td><td>4</td><td>25</td></tr>
    </table>
    """
    events = _british_columbia_calendar_events(
        html,
        now=datetime(2026, 8, 16, 12, tzinfo=UTC),
        lang="fr",
        source_url="https://example.test/bc",
    )

    assert {event.starts_at.date().isoformat() for event in events} == {
        "2026-08-17",
        "2026-09-04",
        "2026-09-14",
    }
    assert all(event.time_is_estimated for event in events)
    assert all(event.source == "BC Stats" for event in events)


def test_bc_expired_schedule_does_not_create_future_dates() -> None:
    html = """
    <h3>2025 release schedule</h3>
    <table>
      <tr><th>2025</th><th>Consumer Price Index</th></tr>
      <tr><td>December</td><td>15</td></tr>
    </table>
    """
    assert not _british_columbia_calendar_events(
        html,
        now=datetime(2026, 8, 16, 12, tzinfo=UTC),
        lang="en",
        source_url="https://example.test/bc",
    )


def test_alberta_calendar_extracts_only_official_lfs_section() -> None:
    html = """
    <p>August 15, 2026</p>
    <h2>Monthly labour force statistics</h2>
    <p>The Labour Force Survey release dates are:</p>
    <ul>
      <li>August 7, 2026</li>
      <li>September 4, 2026</li>
      <li>October 9, 2026</li>
    </ul>
    <p>The following statistics are available, sorted by month:</p>
    """
    events = _alberta_calendar_events(
        html,
        now=datetime(2026, 8, 16, 12, tzinfo=UTC),
        lang="fr",
        source_url="https://example.test/ab",
    )

    assert [event.starts_at.date().isoformat() for event in events] == [
        "2026-09-04",
        "2026-10-09",
    ]
    assert all(event.time_is_estimated for event in events)
    assert all(event.source == "Alberta Labour Market Information" for event in events)


def test_saskatchewan_schedule_has_next_inflation_release() -> None:
    events = _saskatchewan_calendar_events(
        now=datetime(2026, 8, 16, 20, tzinfo=UTC),
        lang="fr",
        source_url="https://example.test/sk",
    )
    assert events
    assert events[0].starts_at.date().isoformat() == "2026-08-17"
    assert "Inflation" in events[0].category


def test_statcan_provincialization_removes_generic_noise() -> None:
    events = [
        SimpleNamespace(
            title="Consumer Price Index, July 2026",
            source="Statistique Canada",
            starts_at=datetime(2026, 8, 17, 8, 30, tzinfo=UTC),
            url="https://example.test/cpi",
        ),
        SimpleNamespace(
            title="New motor vehicle sales, June 2026",
            source="Statistique Canada",
            starts_at=datetime(2026, 8, 17, 8, 30, tzinfo=UTC),
            url="https://example.test/cars",
        ),
        SimpleNamespace(
            title="Canada's international investment position",
            source="Statistique Canada",
            starts_at=datetime(2026, 8, 20, 8, 30, tzinfo=UTC),
            url="https://example.test/iip",
        ),
    ]
    output = provincialize_statcan_events(
        events,
        region="QC",
        lang="fr",
        now=datetime(2026, 8, 16, 0, tzinfo=UTC),
    )
    assert len(output) == 1
    assert output[0].title.startswith("Québec —")
    assert output[0].specificity == "province-normalized"


def test_quebec_general_calendar_fallback_keeps_only_dated_economic_items() -> None:
    html = """
    <div class="calendrier-diffusion_ResultItem__x">
      <div class="calendrier-diffusion_date__x">18 septembre 2026</div>
      <span class="calendrier-diffusion_title__x">Commerce international de marchandises, juillet 2026</span>
    </div>
    <div class="calendrier-diffusion_ResultItem__x">
      <div class="calendrier-diffusion_date__x">23 septembre 2026</div>
      <a class="calendrier-diffusion_title__x" href="/fr/document/pib">Produit intérieur brut par industrie au Québec, juin 2026</a>
    </div>
    <div class="calendrier-diffusion_ResultItem__x">
      <div class="calendrier-diffusion_date__x">18 septembre 2026</div>
      <span class="calendrier-diffusion_title__x">Classement des films, 2024</span>
    </div>
    <div class="calendrier-diffusion_ResultItem__x">
      <div class="calendrier-diffusion_date__x">Septembre 2026</div>
      <span class="calendrier-diffusion_title__x">Statistiques principales du secteur de la fabrication</span>
    </div>
    """
    events = _quebec_general_calendar_events(
        html,
        now=datetime(2026, 9, 5, 20, tzinfo=UTC),
        lang="fr",
        source_url="https://statistique.quebec.ca/fr/statistiques/calendrier-diffusion",
    )
    assert [event.starts_at.date().isoformat() for event in events] == [
        "2026-09-18", "2026-09-23"
    ]
    assert events[1].source_url == "https://statistique.quebec.ca/fr/document/pib"
    assert all(event.source == "Statistique Québec" for event in events)


def test_statcan_provincialization_translates_and_cleans_contacts() -> None:
    events = [
        SimpleNamespace(
            title="(huis clos) Consumer Price Index, July 2026 (Taylor Mitchell, 613-294-3496)",
            source="Statistique Canada",
            starts_at=datetime(2026, 8, 17, 12, 30, tzinfo=UTC),
            url="https://example.test/cpi",
        )
    ]
    output = provincialize_statcan_events(
        events,
        region="QC",
        lang="fr",
        now=datetime(2026, 8, 16, 0, tzinfo=UTC),
    )
    assert len(output) == 1
    assert "Indice des prix à la consommation" in output[0].title
    assert "Taylor Mitchell" not in output[0].title
    assert "huis clos" not in output[0].title.lower()


def test_wholesale_trade_is_valid_provincial_fallback() -> None:
    events = [
        SimpleNamespace(
            title="Wholesale trade, June 2026",
            source="Statistics Canada",
            starts_at=datetime(2026, 9, 15, 12, 30, tzinfo=UTC),
            url="https://example.test/wholesale",
        )
    ]
    output = provincialize_statcan_events(
        events,
        region="ON",
        lang="fr",
        now=datetime(2026, 8, 16, 0, tzinfo=UTC),
    )
    assert len(output) == 1
    assert output[0].region == "ON"
    assert "Commerce de gros" in output[0].title


def test_french_statcan_schedule_covers_requested_provincial_categories() -> None:
    from app.services.calendar import _statcan_official_schedule_fallback

    events = _statcan_official_schedule_fallback(
        now=datetime(2026, 8, 16, 12, tzinfo=UTC),
        language="fr",
    )
    output = provincialize_statcan_events(
        events,
        region="BC",
        lang="fr",
        now=datetime(2026, 8, 16, 12, tzinfo=UTC),
    )

    assert {
        "Inflation",
        "Emploi",
        "Consommation",
        "Commerce",
        "Industrie",
        "Logement",
    } <= {event.category for event in output}
    assert all(event.specificity == "province-normalized" for event in output)


def test_province_direct_event_suppresses_same_day_statcan_duplicate() -> None:
    shared = dict(
        region="AB",
        province="Alberta",
        category="Emploi",
        importance="Élevée",
        importance_score=100,
        starts_at=datetime(2026, 9, 4, 12, 30, tzinfo=UTC),
        source_kind="statistics",
        source_url="https://example.test",
    )
    direct = ProvincialMacroEvent(
        id="direct",
        title="Alberta — Labour Force Survey",
        description="Direct",
        source="Alberta Labour Market Information",
        specificity="province-direct",
        time_is_estimated=True,
        **shared,
    )
    normalized = ProvincialMacroEvent(
        id="statcan",
        title="Alberta — Enquête sur la population active",
        description="StatCan",
        source="Statistique Canada — Alberta",
        source_kind="statcan",
        specificity="province-normalized",
        **{key: value for key, value in shared.items() if key != "source_kind"},
    )

    assert _dedupe_events([direct, normalized]) == [direct]


def test_province_first_releases_never_lets_statcan_outnumber_direct_sources() -> None:
    def release(index: int, source: str, source_kind: str) -> ProvincialMacroRelease:
        return ProvincialMacroRelease(
            id=f"release-{index}",
            region="QC",
            province="Québec",
            title=f"Publication {index}",
            summary="Publication économique officielle.",
            category="PIB",
            importance="Élevée",
            importance_score=90,
            source=source,
            source_kind=source_kind,
            source_url=f"https://example.test/{index}",
            published_at=datetime(2026, 9, index + 1, 12, tzinfo=UTC),
            official=True,
            specificity=(
                "province-normalized" if source_kind == "statcan" else "province-direct"
            ),
        )

    direct = [release(index, "Statistique Québec", "statistics") for index in range(3)]
    statcan = [
        release(index + 10, "Statistique Canada", "statcan")
        for index in range(10)
    ]

    output = _province_first_releases(direct + statcan)

    assert output[:3] == direct
    assert len(output) == 6
    assert sum(item.source_kind == "statcan" for item in output) == len(direct)


def test_province_first_releases_keeps_bounded_statcan_when_direct_feed_is_down() -> None:
    releases = [
        ProvincialMacroRelease(
            id=f"statcan-{index}",
            region="AB",
            province="Alberta",
            title=f"Publication {index}",
            summary="Volet provincial officiel.",
            category="Emploi",
            importance="Élevée",
            importance_score=90,
            source="Statistique Canada",
            source_kind="statcan",
            source_url=f"https://example.test/{index}",
            published_at=datetime(2026, 9, index + 1, 12, tzinfo=UTC),
            official=True,
            specificity="province-normalized",
        )
        for index in range(10)
    ]

    assert len(_province_first_releases(releases)) == 6


def test_dedupe_keeps_distinct_employment_releases_on_same_day() -> None:
    shared = dict(
        region="QC",
        province="Québec",
        category="Emploi",
        importance="Élevée",
        importance_score=100,
        starts_at=datetime(2026, 9, 24, 13, tzinfo=UTC),
        source="Statistique Québec",
        source_kind="statistics",
        source_url="https://example.test/qc",
        specificity="province-direct",
        time_is_estimated=True,
        description="Date officielle.",
    )
    labour = ProvincialMacroEvent(
        id="labour",
        title="Québec — Enquête sur la population active",
        **shared,
    )
    payrolls = ProvincialMacroEvent(
        id="payrolls",
        title="Québec — Rémunération hebdomadaire moyenne",
        **shared,
    )

    assert {event.id for event in _dedupe_events([labour, payrolls])} == {
        "labour", "payrolls"
    }


def test_dedupe_collapses_same_event_from_two_urls() -> None:
    shared = dict(
        region="ON",
        province="Ontario",
        title="Ontario — Consumer Price Index",
        description="Date officielle.",
        category="Inflation",
        importance="Élevée",
        importance_score=100,
        starts_at=datetime(2026, 9, 14, 12, tzinfo=UTC),
        time_is_estimated=True,
        source="Statistics Canada — Ontario",
        source_kind="statcan",
        specificity="province-normalized",
    )
    first = ProvincialMacroEvent(id="first", source_url="https://example.test/a", **shared)
    second = ProvincialMacroEvent(id="second", source_url="https://example.test/b", **shared)

    assert len(_dedupe_events([first, second])) == 1


def test_statcan_relay_uses_language_specific_feed_and_reports_fallback(monkeypatch) -> None:
    import asyncio

    from app.schemas.discovery import FeedStatus
    from app.services.calendar import calendar_service

    calls: list[str] = []
    event = SimpleNamespace(
        title="Consumer Price Index",
        source="Statistics Canada",
        starts_at=datetime(2026, 9, 14, 8, 30, tzinfo=UTC),
        url="https://example.test/statcan-schedule",
    )

    async def fake_feed(language: str):
        calls.append(language)
        return [event], FeedStatus(
            source="Statistique Canada — Indicateurs clés",
            status="unavailable",
            detail="ConnectTimeout after 3 attempts",
        )

    monkeypatch.setattr(calendar_service, "get_statcan_events", fake_feed)
    events, source = asyncio.run(
        ProvincialMacroService()._statcan_calendar_fallback(
            region="AB",
            lang="en",
            now=datetime(2026, 8, 16, 12, tzinfo=UTC),
        )
    )

    assert calls == ["en"]
    assert len(events) == 1
    assert source.status == "partial"
    assert "live feed is degraded" in (source.detail or "")
    assert "ConnectTimeout" not in (source.detail or "")


def test_calendar_snapshot_fast_path_combines_direct_and_statcan(monkeypatch) -> None:
    import asyncio
    from app.schemas.provincial_macro import ProvincialMacroEvent, ProvincialMacroSource
    from app.services.provincial_macro import ProvincialMacroService

    service = ProvincialMacroService()
    direct = ProvincialMacroEvent(
        id="qc-direct",
        region="QC",
        province="Québec",
        title="Québec — Comptes économiques trimestriels",
        description="Date provinciale officielle.",
        category="PIB",
        importance="Élevée",
        importance_score=100,
        starts_at=datetime(2026, 9, 23, 16, tzinfo=UTC),
        time_is_estimated=True,
        source="Statistique Québec",
        source_kind="statistics",
        source_url="https://example.test/qc",
        specificity="province-direct",
    )
    statcan = ProvincialMacroEvent(
        id="qc-statcan",
        region="QC",
        province="Québec",
        title="Québec — Indice des prix à la consommation, septembre 2026",
        description="Volet provincial StatCan.",
        category="Inflation",
        importance="Élevée",
        importance_score=100,
        starts_at=datetime(2026, 10, 20, 12, 30, tzinfo=UTC),
        source="Statistique Canada — Québec",
        source_kind="statcan",
        source_url="https://example.test/statcan",
        specificity="province-normalized",
    )

    async def fake_direct(*args, **kwargs):
        return [direct], ProvincialMacroSource(
            key="calendar-qc",
            label="Statistique Québec — calendrier",
            region="QC",
            kind="statistics",
            url="https://example.test/qc",
            status="available",
            count=1,
        )

    async def fake_statcan(*args, **kwargs):
        return [statcan], ProvincialMacroSource(
            key="statcan-qc",
            label="Statistique Canada — Québec",
            region="QC",
            kind="statcan",
            url="https://example.test/statcan",
            status="available",
            count=1,
        )

    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    snapshot = asyncio.run(service.get_calendar_snapshot("QC", "fr"))
    assert snapshot.region == "QC"
    assert snapshot.latest_releases == []
    assert [item.id for item in snapshot.upcoming_events] == ["qc-direct", "qc-statcan"]
    assert len(snapshot.sources) == 2


def _test_source(region: str, status: str = "available", count: int = 0) -> ProvincialMacroSource:
    return ProvincialMacroSource(
        key=f"calendar-{region.lower()}",
        label=f"{region} calendar",
        region=region,
        kind="statistics",
        url="https://example.test/calendar",
        status=status,
        count=count,
        detail=None,
    )


def _test_event(region: str = "QC", event_id: str = "future") -> ProvincialMacroEvent:
    return ProvincialMacroEvent(
        id=event_id,
        region=region,
        province=PROVINCES[region].fr,
        title=f"{PROVINCES[region].fr} — Consumer Price Index",
        description="Date officielle.",
        category="Inflation",
        importance="Élevée",
        importance_score=100,
        starts_at=datetime.now(UTC) + timedelta(days=30),
        time_is_estimated=True,
        source="Official source",
        source_kind="statistics",
        source_url="https://example.test/calendar",
        specificity="province-direct",
    )


def test_empty_calendar_cache_reloads_after_failure_ttl(monkeypatch) -> None:
    import asyncio
    import app.services.provincial_macro as module

    service = ProvincialMacroService()
    clock = [1_000.0]
    calls = 0

    async def fake_direct(*args, **kwargs):
        nonlocal calls
        calls += 1
        events = [_test_event()] if calls > 1 else []
        return events, _test_source("QC", "available" if events else "unavailable", len(events))

    async def fake_statcan(*args, **kwargs):
        return [], ProvincialMacroSource(
            key="statcan-qc", label="StatCan QC", region="QC", kind="statcan",
            url="https://example.test/statcan", status="unavailable", count=0,
        )

    monkeypatch.setattr(module, "monotonic", lambda: clock[0])
    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    first = asyncio.run(service.get_calendar_snapshot("QC", "fr"))
    clock[0] += 89
    cached = asyncio.run(service.get_calendar_snapshot("QC", "fr"))
    clock[0] += 2
    recovered = asyncio.run(service.get_calendar_snapshot("QC", "fr"))

    assert not first.upcoming_events
    assert cached is first
    assert calls == 2
    assert recovered.upcoming_events


def test_populated_calendar_cache_uses_normal_ttl(monkeypatch) -> None:
    import asyncio
    import app.services.provincial_macro as module

    service = ProvincialMacroService()
    clock = [2_000.0]
    calls = 0

    async def fake_direct(*args, **kwargs):
        nonlocal calls
        calls += 1
        return [_test_event()], _test_source("QC", "available", 1)

    async def fake_statcan(*args, **kwargs):
        return [], ProvincialMacroSource(
            key="statcan-qc", label="StatCan QC", region="QC", kind="statcan",
            url="https://example.test/statcan", status="unavailable", count=0,
        )

    monkeypatch.setattr(module, "monotonic", lambda: clock[0])
    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    first = asyncio.run(service.get_calendar_snapshot("QC", "fr"))
    clock[0] += 899
    second = asyncio.run(service.get_calendar_snapshot("QC", "fr"))

    assert second is first
    assert calls == 1


def test_cache_policy_is_identical_after_single_flight_lock(monkeypatch) -> None:
    import asyncio
    import app.services.provincial_macro as module

    service = ProvincialMacroService()
    clock = [3_000.0]
    calls = 0

    async def fake_direct(*args, **kwargs):
        nonlocal calls
        calls += 1
        return [], _test_source("QC", "unavailable", 0)

    async def fake_statcan(*args, **kwargs):
        return [], ProvincialMacroSource(
            key="statcan-qc", label="StatCan QC", region="QC", kind="statcan",
            url="https://example.test/statcan", status="unavailable", count=0,
        )

    monkeypatch.setattr(module, "monotonic", lambda: clock[0])
    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    async def scenario() -> None:
        lock = service._lock_for(("calendar:QC", "fr"))
        await lock.acquire()
        task = asyncio.create_task(service.get_calendar_snapshot("QC", "fr"))
        await asyncio.sleep(0)
        service._calendar_cache[("QC", "fr")] = (
            clock[0],
            ProvincialMacroSnapshot(
                region="QC", province="Québec", language="fr",
                latest_releases=[], upcoming_events=[], sources=[],
                generated_at=datetime.now(UTC), refresh_after_seconds=90,
            ),
        )
        lock.release()
        await task

    asyncio.run(scenario())
    assert calls == 0


def test_transient_refresh_failure_serves_last_good_as_partial(monkeypatch) -> None:
    import asyncio
    import app.services.provincial_macro as module

    service = ProvincialMacroService()
    clock = [4_000.0]
    calls = 0

    async def fake_direct(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return [_test_event(event_id="retained")], _test_source("QC", "available", 1)
        return [], _test_source("QC", "unavailable", 0)

    async def fake_statcan(*args, **kwargs):
        return [], ProvincialMacroSource(
            key="statcan-qc", label="StatCan QC", region="QC", kind="statcan",
            url="https://example.test/statcan", status="unavailable", count=0,
        )

    monkeypatch.setattr(module, "monotonic", lambda: clock[0])
    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    asyncio.run(service.get_calendar_snapshot("QC", "fr"))
    clock[0] += 901
    stale = asyncio.run(service.get_calendar_snapshot("QC", "fr"))

    assert [event.id for event in stale.upcoming_events] == ["retained"]
    direct_status = next(source for source in stale.sources if source.key == "calendar-qc")
    assert direct_status.status == "partial"
    assert "Dernières dates vérifiables" in (direct_status.detail or "")
    assert stale.refresh_after_seconds == 90
    clock[0] += 89
    assert asyncio.run(service.get_calendar_snapshot("QC", "fr")) is stale
    clock[0] += 2
    retried = asyncio.run(service.get_calendar_snapshot("QC", "fr"))
    assert retried is not stale
    assert calls == 3


def test_empty_full_snapshot_uses_failure_ttl(monkeypatch) -> None:
    import asyncio
    import app.services.provincial_macro as module

    service = ProvincialMacroService()
    clock = [5_000.0]
    calls = 0

    async def fake_page(*args, **kwargs):
        nonlocal calls
        calls += 1
        spec = kwargs["spec"]
        return [], ProvincialMacroSource(
            key=spec.key, label=spec.source, region="NL", kind=spec.kind,
            url=spec.url, status="unavailable", count=0,
        )

    async def fake_direct(*args, **kwargs):
        return [], _test_source("NL", "unavailable", 0)

    async def fake_statcan(*args, **kwargs):
        return [], ProvincialMacroSource(
            key="statcan-nl", label="StatCan NL", region="NL", kind="statcan",
            url="https://example.test/statcan", status="unavailable", count=0,
        )

    async def fake_official_releases(*args, **kwargs):
        return [], []

    monkeypatch.setattr(module, "monotonic", lambda: clock[0])
    monkeypatch.setattr(service, "_fetch_page", fake_page)
    monkeypatch.setattr(
        service,
        "_official_release_feed_with_deadline",
        fake_official_releases,
    )
    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    asyncio.run(service.get_snapshot("NL", "fr"))
    first_calls = calls
    clock[0] += 91
    asyncio.run(service.get_snapshot("NL", "fr"))
    assert calls == first_calls + len(PROVINCES["NL"].pages)


def test_direct_and_statcan_calendars_run_concurrently(monkeypatch) -> None:
    import asyncio

    service = ProvincialMacroService()

    async def scenario() -> ProvincialMacroSnapshot:
        statcan_started = asyncio.Event()

        async def fake_direct(*args, **kwargs):
            await asyncio.wait_for(statcan_started.wait(), timeout=0.2)
            return [_test_event("QC", "direct")], _test_source("QC", "available", 1)

        async def fake_statcan(*args, **kwargs):
            statcan_started.set()
            event = _test_event("QC", "statcan").model_copy(update={
                "title": "Québec — Enquête sur la population active",
                "source": "Statistique Canada — Québec",
                "source_kind": "statcan",
                "specificity": "province-normalized",
            })
            return [event], ProvincialMacroSource(
                key="statcan-qc", label="StatCan QC", region="QC", kind="statcan",
                url="https://example.test/statcan", status="available", count=1,
            )

        monkeypatch.setattr(service, "_direct_calendar", fake_direct)
        monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)
        return await service.get_calendar_snapshot("QC", "fr")

    snapshot = asyncio.run(scenario())
    assert {event.id for event in snapshot.upcoming_events} == {"direct", "statcan"}
    assert all(source.status == "available" for source in snapshot.sources)


def test_one_failed_calendar_source_does_not_erase_the_other(monkeypatch) -> None:
    import asyncio

    service = ProvincialMacroService()

    async def fake_direct(*args, **kwargs):
        raise RuntimeError("secret upstream detail")

    async def fake_statcan(*args, **kwargs):
        event = _test_event("MB", "statcan-only").model_copy(update={
            "source": "Statistique Canada — Manitoba",
            "source_kind": "statcan",
            "specificity": "province-normalized",
        })
        return [event], ProvincialMacroSource(
            key="statcan-mb", label="StatCan MB", region="MB", kind="statcan",
            url="https://example.test/statcan", status="available", count=1,
        )

    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    snapshot = asyncio.run(service.get_calendar_snapshot("MB", "fr"))
    assert [event.id for event in snapshot.upcoming_events] == ["statcan-only"]
    direct = next(source for source in snapshot.sources if source.key == "calendar-mb")
    assert direct.status == "unavailable"
    assert "secret upstream detail" not in (direct.detail or "")


def test_slow_direct_calendar_respects_deadline_and_keeps_statcan(monkeypatch) -> None:
    import asyncio

    service = ProvincialMacroService()
    service.calendar_source_timeout_seconds = 0.01

    async def fake_direct(*args, **kwargs):
        await asyncio.sleep(1)
        return [_test_event("NS", "too-late")], _test_source("NS", "available", 1)

    async def fake_statcan(*args, **kwargs):
        event = _test_event("NS", "statcan-fast").model_copy(update={
            "source": "Statistique Canada — Nouvelle-Écosse",
            "source_kind": "statcan",
            "specificity": "province-normalized",
        })
        return [event], ProvincialMacroSource(
            key="statcan-ns", label="StatCan NS", region="NS", kind="statcan",
            url="https://example.test/statcan", status="available", count=1,
        )

    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", fake_statcan)

    snapshot = asyncio.run(service.get_calendar_snapshot("NS", "fr"))
    assert [event.id for event in snapshot.upcoming_events] == ["statcan-fast"]
    direct = next(source for source in snapshot.sources if source.key == "calendar-ns")
    assert direct.status == "unavailable"
    assert "délai" in (direct.detail or "")


def test_slow_statcan_live_feed_uses_existing_official_schedule(monkeypatch) -> None:
    import asyncio
    import app.services.calendar as calendar_module

    service = ProvincialMacroService()
    service.calendar_source_timeout_seconds = 0.01
    official_event = SimpleNamespace(
        title="Consumer Price Index",
        source="Statistics Canada",
        starts_at=datetime.now(UTC) + timedelta(days=30),
        url="https://www150.statcan.gc.ca/official-schedule.pdf",
    )

    async def fake_direct(*args, **kwargs):
        return [], _test_source("BC", "unavailable", 0)

    async def slow_statcan(*args, **kwargs):
        await asyncio.sleep(1)
        raise AssertionError("deadline should cancel the slow live feed")

    monkeypatch.setattr(service, "_direct_calendar", fake_direct)
    monkeypatch.setattr(service, "_statcan_calendar_fallback", slow_statcan)
    monkeypatch.setattr(
        calendar_module,
        "statcan_official_schedule_events",
        lambda **kwargs: [official_event],
    )

    snapshot = asyncio.run(service.get_calendar_snapshot("BC", "en"))
    assert len(snapshot.upcoming_events) == 1
    assert snapshot.upcoming_events[0].specificity == "province-normalized"
    statcan = next(source for source in snapshot.sources if source.key == "statcan-bc")
    assert statcan.status == "partial"
    assert "official annual schedule" in (statcan.detail or "")
    assert snapshot.refresh_after_seconds == 90
