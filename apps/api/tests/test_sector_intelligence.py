from datetime import UTC, datetime

import pytest

from app.schemas.fundamentals import FinancialSource, SectorMetric
from app.services.fundamental_intelligence import build_fundamental_diagnostic
from app.services.stock_sector_analysis import extract_official_sector_metrics
from test_fundamental_intelligence import sample_snapshot


SOURCE = "https://issuer.example/annual-report.pdf"
FILED = datetime(2026, 2, 10, tzinfo=UTC)


@pytest.mark.parametrize(("family", "line", "key", "expected"), [
    ("mining", "Gold production: 2,100,000 ounces", "gold_production", 2_100_000),
    ("mining", "AISC: US$1,250 per ounce", "gold_aisc", 1250),
    ("real_estate", "AFFO per unit: $2.45", "affo_per_unit", 2.45),
    ("real_estate", "Occupancy rate: 95.2%", "occupancy", 95.2),
    ("insurance", "Combined ratio: 89.1%", "combined_ratio", 89.1),
    ("technology", "Net revenue retention: 118%", "net_revenue_retention", 118),
    ("industrial", "Order backlog: $2,300 million", "order_backlog", 2300),
])
def test_official_sector_extraction_requires_exact_label_and_unit(family, line, key, expected) -> None:
    values = extract_official_sector_metrics(line, family=family, source_url=SOURCE,
                                             source_name="Issuer 2025", filed_at=FILED)
    assert len(values) == 1
    assert values[0].key == key and values[0].value == expected
    assert values[0].period_end is None  # Filing date is not the reporting period.
    assert values[0].source.filed_at == FILED
    assert extract_official_sector_metrics(f"{line}\n{line}", family=family, source_url=SOURCE,
                                           source_name="Issuer", filed_at=FILED) == []
    assert extract_official_sector_metrics(line, family=family, source_url="http://issuer.example/report",
                                           source_name="Issuer", filed_at=FILED) == []


def test_sector_diagnostic_never_promotes_unsupported_or_secondary_facts() -> None:
    snapshot = sample_snapshot(sector="Technology")
    official = FinancialSource(source_type="issuer_official_document", source_name="Issuer 2025",
                               source_url=SOURCE, filed_at=FILED, confidence="official")
    secondary = FinancialSource(source_type="yahoo_public", source_name="Secondary",
                                source_url="https://secondary.example", confidence="secondary")
    snapshot.sector_metrics = [
        SectorMetric(key="net_revenue_retention", label="NRR", value=118, unit="%", source=official),
        SectorMetric(key="annual_recurring_revenue", label="ARR", value=800, unit="million, report currency", source=secondary),
    ]
    result = build_fundamental_diagnostic(snapshot)
    by_key = {item.key: item for item in result.sector_metrics}
    assert by_key["net_revenue_retention"].value == 118
    assert by_key["net_revenue_retention"].filed_at == FILED
    assert by_key["net_revenue_retention"].period_end is None
    assert by_key["annual_recurring_revenue"].status == "unavailable"
    assert by_key["annual_recurring_revenue"].value is None
