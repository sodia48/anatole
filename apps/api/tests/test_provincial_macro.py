from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.provincial_macro import ProvincialMacroSnapshot
from app.services.provincial_macro import (
    PROVINCES,
    _ontario_calendar_events,
    _quebec_calendar_events,
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


def test_quebec_calendar_parser_extracts_only_quebec_future_rows() -> None:
    html = """
    <table>
      <tr>
        <th>Indicateur</th><th>Territoire</th><th>Période</th>
        <th>Dernière diffusion</th><th>Prochaine diffusion</th>
      </tr>
      <tr>
        <td>Comptes économiques trimestriels</td>
        <td>Québec</td><td>2026-I</td><td>2026-06-26</td><td>2026-09-23</td>
      </tr>
      <tr>
        <td>Comptes économiques trimestriels</td>
        <td>Canada</td><td>2026-I</td><td>2026-05-29</td><td>2026-08-28</td>
      </tr>
      <tr>
        <td>Exportations et importations internationales réelles de marchandises</td>
        <td>Québec</td><td>mai 2026</td><td>2026-07-21</td><td>2026-08-18</td>
      </tr>
    </table>
    """
    events = _quebec_calendar_events(
        html,
        now=datetime(2026, 8, 16, 20, tzinfo=UTC),
        lang="fr",
        source_url="https://example.test/qc",
    )
    assert {event.starts_at.date().isoformat() for event in events} == {
        "2026-08-18", "2026-09-23"
    }
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


def test_quebec_official_snapshot_fallback_has_immediate_releases() -> None:
    from app.services.provincial_macro import _quebec_calendar_snapshot_fallback

    events = _quebec_calendar_snapshot_fallback(
        now=datetime(2026, 8, 16, 20, tzinfo=UTC),
        lang="fr",
        source_url="https://statistique.quebec.ca/calendar",
    )
    dates = {event.starts_at.date().isoformat() for event in events}
    assert "2026-08-17" in dates
    assert "2026-08-18" in dates
    assert "2026-08-21" in dates
    assert "2026-09-04" in dates
    assert "2026-09-23" in dates
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
