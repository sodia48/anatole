from datetime import UTC, datetime

from app.schemas.fundamentals import (
    IssuerDocumentCandidate,
)
from app.services.issuer_document_parser import (
    FinancialDocumentParser,
)


VNP_TEXT = """
5N PLUS INC.
INTERIM CONSOLIDATED STATEMENTS OF FINANCIAL POSITION
(in thousands of United States dollars) (unaudited)
March 31 2026 December 31 2025
Cash 45,713 59,573
Total current assets 342,551 302,175
Total assets 518,906 475,130
Current portion of long-term debt 5 1,282 1,233
Total current liabilities 127,159 109,299
Long-term debt 5 119,085 108,604
Total liabilities 302,106 276,166
Equity 216,800 198,964

INTERIM CONSOLIDATED STATEMENTS OF EARNINGS
For the three-month periods ended March 31
(in thousands of United States dollars, except per share information)
2026 2025
Revenue 117,893 88,888
Cost of sales 80,115 61,892
Operating earnings 28,292 15,111
Earnings before income taxes 25,459 13,108
Income tax expense 7,697 3,535
Net earnings 17,762 9,573
Basic earnings per share 0.20 0.11
Diluted earnings per share 0.20 0.11

INTERIM CONSOLIDATED STATEMENTS OF CASH FLOWS
For the three-month periods ended March 31
(in thousands of United States dollars)
2026 2025
Cash (used in) from operating activities (13,495) 6,316
Additions to property, plant and equipment (10,862) (4,395)
Cash at end of period 45,713 30,524
"""


def document() -> IssuerDocumentCandidate:
    return IssuerDocumentCandidate(
        url="https://issuer.example/q1-2026.pdf",
        title="Q1 2026 Financial Statements",
        document_format="pdf",
        document_type="quarterly",
        score=90,
        origin_url="https://issuer.example/investors",
        published_at=datetime(
            2026,
            5,
            6,
            tzinfo=UTC,
        ),
    )


def test_parser_extracts_official_vnp_style_statements() -> None:
    parser = FinancialDocumentParser()
    periods = parser.parse_text(
        VNP_TEXT,
        document(),
    )

    latest = next(
        period
        for period in periods
        if period.period_end.year == 2026
    )

    assert latest.currency == "USD"
    assert latest.total_revenue == 117_893_000
    assert latest.operating_income == 28_292_000
    assert latest.net_income == 17_762_000
    assert latest.operating_cash_flow == -13_495_000
    assert latest.capital_expenditure == -10_862_000
    assert latest.free_cash_flow == -24_357_000
    assert latest.total_cash == 45_713_000
    assert latest.current_assets == 342_551_000
    assert latest.current_liabilities == 127_159_000
    assert latest.total_assets == 518_906_000
    assert latest.total_liabilities == 302_106_000
    assert latest.stockholder_equity == 216_800_000
    assert latest.total_debt == 120_367_000
    assert latest.net_debt == 74_654_000
    assert latest.diluted_eps == 0.20
    assert latest.source is not None
    assert (
        latest.source.source_type
        == "issuer_official_document"
    )
