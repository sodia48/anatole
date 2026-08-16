from app.services.provincial_statistical_news import (
    PageSpec,
    parse_release_page,
)


def test_parse_statistique_quebec_page() -> None:
    html = """
    <html>
      <body>
        <main>
          <h1>Indice des prix à la consommation</h1>
          <p>Mise à jour : 20 juillet 2026</p>
          <p>
            Au Québec, l’IPC connaît une hausse de 3,2 % en juin 2026
            par rapport à juin 2025.
          </p>
        </main>
      </body>
    </html>
    """
    spec = PageSpec(
        source="Statistique Québec",
        region="QC",
        category="Inflation",
        url="https://example.test/cpi",
    )
    item = parse_release_page(html, spec)
    assert item is not None
    assert item.source == "Statistique Québec"
    assert item.region == "QC"
    assert item.category == "Inflation"
    assert item.published_at is not None
    assert item.published_at.year == 2026
