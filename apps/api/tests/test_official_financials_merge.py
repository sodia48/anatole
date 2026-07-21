from datetime import UTC, datetime

from app.schemas.fundamentals import (
    FinancialPeriod,
    FinancialSource,
)
from app.services.official_financials import (
    merge_periods,
)


def period(
    *,
    revenue: float | None,
    cash: float | None,
    official: bool,
) -> FinancialPeriod:
    return FinancialPeriod(
        period_end=datetime(
            2026,
            3,
            31,
            tzinfo=UTC,
        ),
        period_type="quarterly",
        currency="CAD",
        total_revenue=revenue,
        total_cash=cash,
        source=(
            FinancialSource(
                source_type="sec_edgar_xbrl",
                source_name="SEC EDGAR",
                confidence="official",
            )
            if official
            else None
        ),
    )


def test_official_values_override_only_when_present() -> None:
    fallback = period(
        revenue=100,
        cash=10,
        official=False,
    )
    official = period(
        revenue=None,
        cash=25,
        official=True,
    )

    merged = merge_periods(
        [fallback],
        [official],
        limit=12,
    )[0]

    assert merged.total_revenue == 100
    assert merged.total_cash == 25
    assert merged.source is not None
    assert merged.source.confidence == "official"
