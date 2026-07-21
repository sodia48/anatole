from datetime import UTC, datetime
from io import BytesIO

from openpyxl import Workbook

from app.schemas.fundamentals import (
    IssuerDocumentCandidate,
)
from app.services.issuer_document_parser import (
    FinancialDocumentParser,
)


def xlsx_document() -> IssuerDocumentCandidate:
    return IssuerDocumentCandidate(
        url="https://issuer.example/q1-2026.xlsx",
        title="Q1 2026 Supplementary Financial Statements",
        document_format="xlsx",
        document_type="quarterly",
        score=80,
        origin_url="https://issuer.example/investors",
        published_at=datetime(
            2026,
            5,
            7,
            tzinfo=UTC,
        ),
    )


def workbook_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Financial statements"

    rows = [
        ["CONSOLIDATED STATEMENTS OF FINANCIAL POSITION"],
        ["in millions of Canadian dollars"],
        ["", datetime(2026, 3, 31), datetime(2025, 12, 31)],
        ["Cash and cash equivalents", 120, 105],
        ["Total current assets", 900, 850],
        ["Total assets", 2500, 2400],
        ["Current portion of long-term debt", 15, 10],
        ["Long-term debt", 400, 380],
        ["Total current liabilities", 500, 470],
        ["Total liabilities", 1400, 1350],
        ["Shareholders equity", 1100, 1050],
        ["CONSOLIDATED STATEMENTS OF INCOME"],
        ["For the three-month periods ended March 31"],
        ["in millions of Canadian dollars"],
        ["", 2026, 2025],
        ["Revenue", 600, 550],
        ["Operating income", 120, 100],
        ["Net income", 75, 65],
        ["CONSOLIDATED STATEMENTS OF CASH FLOWS"],
        ["For the three-month periods ended March 31"],
        ["in millions of Canadian dollars"],
        ["", 2026, 2025],
        ["Net cash provided by operating activities", 140, 110],
        ["Capital expenditures", -45, -40],
    ]

    for row in rows:
        sheet.append(row)

    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def test_xlsx_parser_uses_cached_values_and_units() -> None:
    parser = FinancialDocumentParser()
    periods = parser.parse_bytes(
        workbook_bytes(),
        xlsx_document(),
    )

    latest = next(
        period
        for period in periods
        if period.period_end.year == 2026
    )

    assert latest.currency == "CAD"
    assert latest.total_revenue == 600_000_000
    assert latest.operating_cash_flow == 140_000_000
    assert latest.capital_expenditure == -45_000_000
    assert latest.free_cash_flow == 95_000_000
    assert latest.total_cash == 120_000_000
    assert latest.total_debt == 415_000_000
