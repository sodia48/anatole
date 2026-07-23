from datetime import UTC, datetime

from app.schemas.fundamentals import FinancialPeriod, FinancialSource
from app.services.official_financials import merge_periods


def test_official_field_overrides_structured_field() -> None:
    period_end = datetime(2025, 12, 31, tzinfo=UTC)
    structured = FinancialPeriod(
        period_end=period_end,
        period_type="annual",
        currency="CAD",
        total_revenue=100,
        total_cash=20,
        source=FinancialSource(
            source_type="yahoo_structured",
            source_name="Yahoo structured",
            confidence="secondary",
        ),
    )
    official = FinancialPeriod(
        period_end=period_end,
        period_type="annual",
        currency="CAD",
        total_revenue=105,
        source=FinancialSource(
            source_type="issuer_official_document",
            source_name="Official annual report",
            confidence="official",
        ),
    )
    merged = merge_periods([structured], [official], limit=5)[0]

    assert merged.total_revenue == 105
    assert merged.total_cash == 20
    assert merged.source is not None
    assert merged.source.confidence == "official"
