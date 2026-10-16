from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.fundamentals import (
    AnalystConsensus,
    CorporateEvents,
    FinancialHighlights,
    FinancialPeriod,
    FinancialSource,
    FundamentalMetrics,
    FundamentalSnapshot,
    TTMSummary,
)
from app.services.fundamental_intelligence import build_fundamental_diagnostic


def sample_snapshot(*, sector: str = "Industrials", older_currency: str = "CAD") -> FundamentalSnapshot:
    source = FinancialSource(
        source_type="issuer_official_document", source_name="Issuer annual report",
        source_url="https://issuer.example/reports/2025.pdf",
        filed_at=datetime(2026, 2, 10, tzinfo=UTC), confidence="official",
    )
    rows = [
        FinancialPeriod(
            period_end=datetime(year, 12, 31, tzinfo=UTC), period_type="annual",
            currency="CAD" if year != 2023 else older_currency,
            total_revenue=revenue, operating_income=operating, net_income=income,
            operating_cash_flow=cash_flow, free_cash_flow=free_cash,
            current_assets=current_assets, current_liabilities=100,
            total_cash=50, total_debt=100, stockholder_equity=200,
            ebitda=ebitda, source=source,
        )
        for year, revenue, operating, income, cash_flow, free_cash, current_assets, ebitda in [
            (2025, 1200, 180, 100, 70, 40, 220, 250),
            (2024, 1000, 140, 80, 100, 70, 200, 210),
            (2023, 900, 110, 70, 80, 50, 190, 180),
        ]
    ]
    return FundamentalSnapshot(
        ticker="TEST.TO", symbol="TEST", name="Test Issuer", sector=sector,
        currency="CAD", financial_currency="CAD", status="available", metrics=FundamentalMetrics(),
        annual_financials=rows, ttm=TTMSummary(), highlights=FinancialHighlights(),
        analysts=AnalystConsensus(), events=CorporateEvents(), source="Issuer annual report",
        generated_at=datetime(2026, 2, 11, tzinfo=UTC),
    )


def test_diagnostic_keeps_formulas_sources_and_divergence() -> None:
    result = build_fundamental_diagnostic(sample_snapshot())
    measures = {item.key: item for item in result.measures}
    assert measures["revenue_growth"].observations[0].value == 20
    assert measures["operating_margin"].observations[0].value == 15
    assert measures["cash_conversion"].observations[0].value == 70
    assert measures["cash_conversion"].observations[0].nature == "calculated"
    assert measures["cash_conversion"].observations[0].source_url == "https://issuer.example/reports/2025.pdf"
    assert measures["cash_conversion"].observations[0].filed_at is not None
    assert measures["revenue"].observations[0].nature == "published"
    assert any(item.measure_keys == ["net_income", "free_cash_flow"] for item in result.findings)
    assert result.global_score is None
    assert result.dimensions[1].score_status == "directional"
    assert len(result.dimensions[1].contributions) == 2


def test_currency_mismatch_missing_inputs_and_sign_change_are_explicit() -> None:
    snapshot = sample_snapshot(older_currency="USD")
    snapshot.annual_financials[0].net_income = -5
    snapshot.annual_financials[0].current_liabilities = 0
    result = build_fundamental_diagnostic(snapshot)
    measures = {item.key: item for item in result.measures}
    assert len(measures["revenue_growth"].observations) == 1  # 2024/2023 refused, 2025/2024 retained.
    assert measures["net_income_growth"].status == "insufficient"
    assert measures["net_income_growth"].observations == []
    assert measures["current_ratio"].observations[0].period_end.year == 2024
    assert measures["cash_conversion"].observations[0].period_end.year == 2024


def test_bank_does_not_inherit_industrial_leverage_and_liquidity_scores() -> None:
    result = build_fundamental_diagnostic(sample_snapshot(sector="Financial Services, Banks"))
    dimensions = {item.key: item for item in result.dimensions}
    measures = {item.key: item for item in result.measures}
    assert dimensions["liquidity"].score_status == "not_applicable"
    assert dimensions["leverage"].score_status == "not_applicable"
    assert measures["debt_to_equity"].status == "not_applicable"


def test_directional_index_requires_consecutive_fiscal_years() -> None:
    snapshot = sample_snapshot()
    snapshot.annual_financials[1].period_end = datetime(2020, 12, 31, tzinfo=UTC)
    result = build_fundamental_diagnostic(snapshot)
    assert all(dimension.score is None for dimension in result.dimensions)


def test_real_http_diagnostic_endpoint(monkeypatch) -> None:
    async def snapshot_for_test(_ticker: str) -> FundamentalSnapshot:
        return sample_snapshot()

    monkeypatch.setattr("app.api.routes.fundamentals.fundamentals_service.get_snapshot", snapshot_for_test)
    response = TestClient(app).get("/api/v1/stocks/TEST/fundamental-intelligence/diagnostic")
    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "TEST.TO"
    assert body["global_score"] is None
    assert body["measures"][0]["observations"][0]["source_url"] == "https://issuer.example/reports/2025.pdf"
