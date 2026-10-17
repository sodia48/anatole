from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.fundamentals import IssuerDocumentCandidate
from app.services.fundamental_documents import research_official_documents
from app.services.issuer_document_parser import financial_document_parser
from test_fundamental_intelligence import sample_snapshot


def candidate(year: int, format_value: str = "pdf") -> IssuerDocumentCandidate:
    return IssuerDocumentCandidate(
        url=f"https://issuer.example/annual-{year}.{format_value}", title=f"Annual report {year}",
        document_format=format_value, document_type="annual", score=80, origin_url="https://issuer.example",
        published_at=datetime(year + 1, 2, 10, tzinfo=UTC),
    )


async def test_exact_excerpts_pages_and_comparison_do_not_infer_accounting_changes(monkeypatch) -> None:
    snapshot = sample_snapshot()
    snapshot.website = "https://issuer.example"
    async def discover(_ticker, _website):
        return "https://issuer.example", [candidate(2025), candidate(2024)], None
    async def download(document):
        return document.url.encode()
    def pages(content, _document, **_kwargs):
        if b"2025" in content:
            return [(1, "Revenue increased to 100 CAD in the annual period.\n"),
                    (3, "Accounting policy changed for inventory valuation.")]
        return [(2, "Revenue increased to 90 CAD in the annual period.\n")]
    monkeypatch.setattr("app.services.fundamental_documents.issuer_financial_documents_service.discover", discover)
    monkeypatch.setattr("app.services.fundamental_documents.issuer_financial_documents_service.download_document", download)
    monkeypatch.setattr("app.services.fundamental_documents.financial_document_parser.extract_pages", pages)
    result = await research_official_documents(snapshot)
    assert result.status == "available"
    assert result.documents_scanned == 2
    assert any(item.page_number == 1 and item.excerpt == "Revenue increased to 100 CAD in the annual period."
               for item in result.passages)
    assert len(result.comparisons) == 1
    assert result.comparisons[0].topic == "results"
    assert "requires review" in result.comparisons[0].note
    assert any(item.topic == "accounting" and item.page_number == 3 for item in result.passages)
    searched = await research_official_documents(snapshot, "Revenue")
    assert searched.query == "Revenue"
    assert all(item.topic == "query" and "Revenue" in item.excerpt for item in searched.passages)
    assert len(searched.comparisons) == 1
    assert searched.comparisons[0].topic == "query"


def test_pdf_page_numbers_are_physical_and_html_has_no_page(monkeypatch) -> None:
    class FakePage:
        def __init__(self, text):
            self.text = text
        def extract_text(self, **_kwargs):
            return self.text
    class FakeReader:
        def __init__(self, _stream):
            self.pages = [FakePage("First page"), FakePage(""), FakePage("Third page")]
    monkeypatch.setattr("app.services.issuer_document_parser.PdfReader", FakeReader)
    assert financial_document_parser.extract_pages(b"pdf", candidate(2025)) == [(1, "First page"), (3, "Third page")]
    monkeypatch.setattr(financial_document_parser, "extract_text", lambda *_args, **_kwargs: "HTML text")
    assert financial_document_parser.extract_pages(b"html", candidate(2025, "html")) == [(None, "HTML text")]


def test_http_document_endpoint_returns_explicit_absence(monkeypatch) -> None:
    async def get_snapshot(_ticker):
        return sample_snapshot()
    monkeypatch.setattr("app.api.routes.fundamentals.fundamentals_service.get_snapshot", get_snapshot)
    response = TestClient(app).get("/api/v1/stocks/TEST/fundamental-intelligence/documents", params={"query": "revenue"})
    assert response.status_code == 200
    assert response.json()["status"] == "partial"
    assert response.json()["passages"] == []
    assert response.json()["reported_observations"][0]["source_url"] == "https://issuer.example/reports/2025.pdf"
    assert TestClient(app).get("/api/v1/stocks/TEST/fundamental-intelligence/documents", params={"query": "x"}).status_code == 422


def test_http_document_endpoint_keeps_source_page(monkeypatch) -> None:
    async def get_snapshot(_ticker):
        snapshot = sample_snapshot()
        snapshot.website = "https://issuer.example"
        return snapshot
    async def discover(_ticker, _website):
        return "https://issuer.example", [candidate(2025)], None
    async def download(_document):
        return b"document"
    monkeypatch.setattr("app.api.routes.fundamentals.fundamentals_service.get_snapshot", get_snapshot)
    monkeypatch.setattr("app.services.fundamental_documents.issuer_financial_documents_service.discover", discover)
    monkeypatch.setattr("app.services.fundamental_documents.issuer_financial_documents_service.download_document", download)
    monkeypatch.setattr("app.services.fundamental_documents.financial_document_parser.extract_pages",
                        lambda *_args, **_kwargs: [(7, "Revenue increased to 100 CAD in the annual period.")])
    response = TestClient(app).get("/api/v1/stocks/TEST/fundamental-intelligence/documents", params={"query": "Revenue"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "available"
    assert body["passages"][0]["page_number"] == 7
    assert body["passages"][0]["document_url"] == "https://issuer.example/annual-2025.pdf"


def test_only_original_official_values_are_reported(monkeypatch) -> None:
    snapshot = sample_snapshot()
    snapshot.annual_financials[0].calculated_fields = ["free_cash_flow"]
    snapshot.annual_financials[1].source = snapshot.annual_financials[1].source.model_copy(update={"confidence": "secondary"})
    snapshot.stale = True
    async def get_snapshot(_ticker):
        return snapshot
    monkeypatch.setattr("app.api.routes.fundamentals.fundamentals_service.get_snapshot", get_snapshot)
    body = TestClient(app).get("/api/v1/stocks/TEST/fundamental-intelligence/documents").json()
    assert body["source_stale"] is True
    assert all(not (item["metric"] == "free_cash_flow" and item["period_end"].startswith("2025"))
               for item in body["reported_observations"])
    assert all(not item["period_end"].startswith("2024") for item in body["reported_observations"])
