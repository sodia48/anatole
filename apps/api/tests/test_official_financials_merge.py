from datetime import UTC, datetime

from app.schemas.fundamentals import (
    FinancialPeriod,
    FinancialSource,
)
from app.services.official_financials import (
    classify_fundamental_status,
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
    assert merged.field_sources["total_cash"].confidence == "official"
    assert merged.field_sources["total_revenue"] is None  # Unsourced fallback is not called an official observation.


def test_merge_retains_original_currency_and_field_provenance() -> None:
    secondary = FinancialSource(source_type="yahoo_structured", source_name="Yahoo structured", confidence="secondary")
    fallback = period(revenue=100, cash=10, official=False).model_copy(update={"source": secondary})
    official = period(revenue=None, cash=25, official=True)
    merged = merge_periods([fallback], [official], limit=12)[0]
    assert merged.field_sources["total_revenue"].source_type == "yahoo_structured"
    assert merged.field_sources["total_cash"].source_type == "sec_edgar_xbrl"
    assert merged.total_revenue == 100
    usd = official.model_copy(update={"currency": "USD"})
    incompatible = merge_periods([fallback], [usd], limit=12)
    assert len(incompatible) == 1
    assert incompatible[0].currency == "USD"
    assert incompatible[0].total_revenue is None


def test_public_status_reflects_real_coverage_and_source_failures() -> None:
    assert classify_fundamental_status(
        metric_fields=0,
        statement_fields=0,
        usable_periods=0,
        source_failed=True,
    ) == "unavailable"
    assert classify_fundamental_status(
        metric_fields=18,
        statement_fields=30,
        usable_periods=4,
        source_failed=False,
    ) == "available"
    assert classify_fundamental_status(
        metric_fields=18,
        statement_fields=30,
        usable_periods=4,
        source_failed=True,
    ) == "partial"
    assert classify_fundamental_status(
        metric_fields=2,
        statement_fields=3,
        usable_periods=1,
        source_failed=False,
    ) == "partial"
