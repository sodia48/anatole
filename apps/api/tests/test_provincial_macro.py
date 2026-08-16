from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.provincial_macro import (
    PROVINCES,
    _ontario_calendar_events,
    _quebec_calendar_events,
    _saskatchewan_calendar_events,
    classify_macro,
    normalize_region,
    provincialize_statcan_events,
)


def test_all_ten_provinces_are_registered() -> None:
    assert set(PROVINCES) == {
        "QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL"
    }


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
