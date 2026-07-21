from app.services.issuer_documents import (
    _LinkExtractor,
    classify_document,
    document_format,
    score_document,
)


def test_document_scoring_prefers_statements_over_presentations() -> None:
    statements = score_document(
        "Q1 2026 Financial Statements",
        "https://issuer.example/q1-2026-statements.pdf",
        current_year=2026,
    )
    presentation = score_document(
        "Q1 2026 Investor Presentation",
        "https://issuer.example/q1-2026-presentation.pdf",
        current_year=2026,
    )

    assert statements > presentation
    assert statements >= 60


def test_asset_urls_with_cdn_suffix_are_detected() -> None:
    url = (
        "https://issuer.example/assets/"
        "q1-information.xlsx-blt123"
    )
    assert document_format(url) == "xlsx"


def test_link_extractor_preserves_anchor_text() -> None:
    parser = _LinkExtractor()
    parser.feed(
        '<a href="/q1.pdf">Q1 2026 Financial Statements</a>'
    )
    parser.close()

    assert parser.links == [
        (
            "/q1.pdf",
            "Q1 2026 Financial Statements",
        )
    ]
    assert (
        classify_document(
            parser.links[0][1],
            parser.links[0][0],
        )
        == "quarterly"
    )
