from app.schemas.discovery import NewsBriefRequest
from app.services.news_brief import NewsBriefService


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
    assert "production" in brief.why_it_matters.lower()


def test_brief_fallback_is_explicit() -> None:
    service = NewsBriefService()
    brief = service.build_from_text(
        make_request(summary="La publication présente les données mensuelles de juillet."),
        "La publication présente les données mensuelles de juillet.",
        source_mode="feed_summary",
    )
    assert brief.source_mode == "feed_summary"
    assert "distinct" in brief.source_note.lower()
    assert brief.watch


def test_official_allowlist_blocks_arbitrary_hosts() -> None:
    service = NewsBriefService()
    assert service._allowed("https://www150.statcan.gc.ca/n1/test") is True
    assert service._allowed("https://www.bankofcanada.ca/test") is True
    assert service._allowed("http://127.0.0.1:8000/private") is False
    assert service._allowed("https://example.com/article") is False


def test_stock_brief_uses_company_specific_context() -> None:
    service = NewsBriefService()
    request = make_request(
        title="BlackBerry revenue jumps 26% as QNX unit hits record quarter",
        summary=(
            "BlackBerry reported second-quarter revenue of US$163.3 million, "
            "up 26% from US$129.6 million a year earlier. QNX delivered record quarterly revenue."
        ),
        url="https://example.com/blackberry-results",
        source="Publisher",
        category="Stock",
        context="stock",
        ticker="BB",
        company="BlackBerry Limited",
    )
    brief = service.build_from_text(request, request.summary, source_mode="feed_summary")
    assert brief.key_figures
    assert any("26" in figure.value for figure in brief.key_figures)
    assert brief.changes
    assert "BlackBerry" in brief.why_it_matters
    assert brief.watch
    assert "éditeur" in brief.source_note
