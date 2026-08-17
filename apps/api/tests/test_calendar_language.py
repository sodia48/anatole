from __future__ import annotations

from datetime import UTC, datetime

from app.services.calendar import (
    BOC_URLS,
    STATCAN_ANNUAL_SCHEDULE_URLS,
    STATCAN_JSON_URLS,
    STATCAN_URLS,
    CalendarService,
    _category,
    _importance,
    _parse_boc_html,
    _parse_full_date,
    _parse_short_date,
    _parse_statcan_html,
    _parse_statcan_json,
    _statcan_official_schedule_fallback,
)


def test_french_dates_are_parsed() -> None:
    assert str(_parse_full_date("21 août 2026")) == "2026-08-21"
    assert str(_parse_full_date("September 2, 2026")) == "2026-09-02"
    assert str(_parse_short_date("14 août", 2026)) == "2026-08-14"
    assert str(_parse_short_date("August 14", 2026)) == "2026-08-14"


def test_french_statcan_calendar_keeps_official_title() -> None:
    html = """
    <html><body>
      <h1>Calendrier de diffusion - août 2026</h1>
      <h2>14 août</h2>
      <ul>
        <li>Enquête mensuelle sur les industries manufacturières, juin 2026</li>
        <li>Commerce de gros, juin 2026</li>
      </ul>
    </body></html>
    """
    events = _parse_statcan_html(
        html,
        now=datetime(2026, 8, 13, 12, 0, tzinfo=UTC),
        language="fr",
        url=STATCAN_URLS["fr"],
    )

    assert len(events) == 2
    assert events[0].title.startswith("Enquête mensuelle")
    assert events[1].title == "Commerce de gros, juin 2026"
    assert events[0].url == STATCAN_URLS["fr"]
    assert events[0].category == "Industrie"


def test_statcan_javascript_array_calendar_is_parsed_without_eval() -> None:
    content = """
    [
      {
        date: "2026-09-04 00:00:01",
        type: "meeting",
        title: "Labour Force Survey",
        description: "August 2026",
        url: "//www.statcan.gc.ca/daily-quotidien/260904/dq260904a-eng.htm"
      }
    ]
    """
    events = _parse_statcan_json(
        content,
        now=datetime(2026, 8, 16, 12, tzinfo=UTC),
        language="en",
        url=STATCAN_JSON_URLS["en"],
    )

    assert len(events) == 1
    assert events[0].title == "Labour Force Survey"
    assert events[0].starts_at.isoformat().startswith("2026-09-04T08:30")
    assert events[0].url.startswith("https://www.statcan.gc.ca/")
    assert "August 2026" in (events[0].description or "")


def test_statcan_annual_schedule_fallback_is_official_and_bounded() -> None:
    events = _statcan_official_schedule_fallback(
        now=datetime(2026, 8, 16, 12, tzinfo=UTC),
        language="fr",
    )
    titles = {event.title for event in events}
    dates = {event.starts_at.date().isoformat() for event in events}

    assert "Indice des prix à la consommation" in titles
    assert "Enquête sur la population active" in titles
    assert "Commerce de détail" in titles
    assert "2026-08-17" in dates
    assert "2027-03-31" in dates
    assert all(event.url == STATCAN_ANNUAL_SCHEDULE_URLS["fr"] for event in events)
    assert not _statcan_official_schedule_fallback(
        now=datetime(2027, 4, 1, 12, tzinfo=UTC),
        language="fr",
    )


def test_french_boc_calendar_keeps_official_title_and_time() -> None:
    html = """
    <html><body>
      <h2>21 août 2026</h2>
      <h3><a href="/2026/08/credit-survey/">Publication : Enquête auprès des responsables du crédit</a></h3>
      <p>10 h 30 (HE)</p>
      <p>L'enquête recueille des renseignements sur les pratiques de prêt.</p>
      <p>Type(s) de contenu : Événements à venir</p>
      <h2>2 septembre 2026</h2>
      <h3>Annonce du taux directeur</h3>
      <p>9 h 45 (HE)</p>
      <p>La Banque annonce sa décision de politique monétaire.</p>
    </body></html>
    """
    events = _parse_boc_html(
        html,
        now=datetime(2026, 8, 13, 12, 0, tzinfo=UTC),
        url=BOC_URLS["fr"],
    )

    assert len(events) == 2
    assert events[0].title == "Publication : Enquête auprès des responsables du crédit"
    assert events[0].starts_at.hour == 10
    assert events[0].starts_at.minute == 30
    assert events[1].title == "Annonce du taux directeur"
    assert events[1].starts_at.hour == 9
    assert events[1].starts_at.minute == 45
    assert events[1].category == "Politique monétaire"
    assert events[1].importance == "Élevée"


def test_french_holidays_are_excluded() -> None:
    html = """
    <html><body>
      <h2>7 septembre 2026</h2>
      <h3>Fête du Travail</h3>
      <p>Congé national</p>
      <h2>16 septembre 2026</h2>
      <h3>Publication : Résumé des délibérations</h3>
      <p>13 h 30 (HE)</p>
      <p>Résumé des délibérations du Conseil de direction.</p>
    </body></html>
    """
    events = _parse_boc_html(
        html,
        now=datetime(2026, 8, 13, 12, 0, tzinfo=UTC),
        url=BOC_URLS["fr"],
    )

    assert [event.title for event in events] == [
        "Publication : Résumé des délibérations"
    ]


def test_language_feeds_and_cache_are_separate() -> None:
    service = CalendarService()

    assert STATCAN_URLS["fr"].endswith("cal2-fra.htm")
    assert STATCAN_URLS["en"].endswith("cal2-eng.htm")
    assert "banqueducanada.ca" in BOC_URLS["fr"]
    assert "bankofcanada.ca" in BOC_URLS["en"]
    assert service._normalize_language("fr") == "fr"
    assert service._normalize_language("en") == "en"
    assert service._normalize_language("xx") == "fr"


def test_french_classification_keywords() -> None:
    assert _category("Commerce de gros, juin 2026") == "Commerce"
    assert _category("Annonce du taux directeur") == "Politique monétaire"
    assert _category("Enquête sur la population active") == "Travail"
    assert _importance("Annonce du taux directeur") == "Élevée"


def test_calendar_regions() -> None:
    html = """
    <html><body>
      <h1>Calendrier de diffusion - août 2026</h1>
      <h2>14 août</h2>
      <ul>
        <li>Enquête sur la population active, juillet 2026</li>
        <li>Produit intérieur brut du Québec, 2025</li>
      </ul>
    </body></html>
    """
    events = _parse_statcan_html(
        html,
        now=datetime(2026, 8, 13, 12, 0, tzinfo=UTC),
        language="fr",
        url=STATCAN_URLS["fr"],
    )
    assert "QC" in events[0].regions
    assert "ON" in events[0].regions
    assert events[1].regions == ["QC"]
