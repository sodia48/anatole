from __future__ import annotations

import io
import zipfile

import pytest

from app.services.provincial_statistics import (
    METRICS,
    ProvincialStatisticsService,
    _parse_retail_sales_zip,
)


CSV_HEADER = (
    "REF_DATE,GEO,DGUID,"
    "North American Industry Classification System (NAICS),"
    "Sales,Adjustments,UOM,UOM_ID,SCALAR_FACTOR,SCALAR_ID,"
    "VECTOR,COORDINATE,VALUE,STATUS,SYMBOL,TERMINATED,DECIMALS"
)


def retail_zip() -> bytes:
    rows = [
        CSV_HEADER,
        (
            "2026-05,Prince Edward Island,1,"
            "Retail trade [44-45],Total retail sales,"
            "Seasonally adjusted,Dollars,81,thousands,3,"
            "v1,1,300,,,,0"
        ),
        (
            "2026-06,Prince Edward Island,1,"
            "Retail trade [44-45],Total retail sales,"
            "Seasonally adjusted,Dollars,81,thousands,3,"
            "v2,1,307,,,,0"
        ),
        (
            "2026-06,Prince Edward Island,1,"
            "Retail trade [44-45],Total retail sales,"
            "Unadjusted,Dollars,81,thousands,3,"
            "v3,1,999,,,,0"
        ),
        (
            "2026-06,Prince Edward Island,1,"
            "Retail trade [44-45],Retail e-commerce sales,"
            "Seasonally adjusted,Dollars,81,thousands,3,"
            "v4,1,888,,,,0"
        ),
        (
            "2026-06,Ontario,2,"
            "Retail trade [44-45],Total retail sales,"
            "Seasonally adjusted,Dollars,81,thousands,3,"
            "v5,1,28400,,,,0"
        ),
    ]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("20100056.csv", "\n".join(rows))
    return buffer.getvalue()


def test_retail_zip_selects_official_adjusted_total() -> None:
    parsed = _parse_retail_sales_zip(retail_zip())

    assert parsed["Prince Edward Island"] == [
        ("2026-05", 300_000.0),
        ("2026-06", 307_000.0),
    ]
    assert parsed["Ontario"] == [
        ("2026-06", 28_400_000.0),
    ]


@pytest.mark.asyncio
async def test_retail_metric_uses_csv_and_computes_change() -> None:
    service = ProvincialStatisticsService()

    async def fake_rows(_client):
        return {
            "Prince Edward Island": [
                ("2026-05", 300_000_000.0),
                ("2026-06", 307_000_000.0),
            ],
        }

    service._retail_sales_rows = fake_rows  # type: ignore[method-assign]
    spec = next(item for item in METRICS if item.key == "retail_sales")

    metrics, issue = await service._retail_sales_for_provinces(
        object(),  # type: ignore[arg-type]
        spec,
        [
            {
                "code": "PE",
                "fr": "Île-du-Prince-Édouard",
                "en": "Prince Edward Island",
            }
        ],
        "fr",
    )

    assert issue is None
    metric = metrics["PE"]
    assert metric.value == 307_000_000.0
    assert metric.previous_value == 300_000_000.0
    assert metric.reference_period == "2026-06"
    assert metric.change is not None
    assert round(metric.change, 6) == round((307 / 300 - 1) * 100, 6)


def test_retail_spec_uses_exact_official_sales_member() -> None:
    spec = next(item for item in METRICS if item.key == "retail_sales")
    sales_selector = next(
        selector
        for selector in spec.selectors
        if "sales" in selector.dimension_terms
    )
    assert "total retail sales" in sales_selector.member_terms
