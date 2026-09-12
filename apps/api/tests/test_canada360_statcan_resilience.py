from __future__ import annotations

import asyncio

import pytest

from app.schemas.canada_360 import Canada360Metric, Canada360Province
from app.schemas.provincial_statistics import ProvincialMetric
from app.services.canada_360 import Canada360Service
from app.services.provincial_statistics import (
    METRICS,
    PROVINCES,
    PROVINCE_BY_CODE,
    _resolve_coordinate,
)


def c360_metric(key: str, value: float = 1.0) -> Canada360Metric:
    return Canada360Metric(
        key=key,
        label=key,
        category="test",
        value=value,
        unit="index",
        source_name="test",
        freshness="fresh",
    )


@pytest.mark.asyncio
async def test_macro_timeout_is_partial_not_all_or_nothing(
    monkeypatch,
) -> None:
    service = Canada360Service()
    service.macro_metric_deadline_seconds = 0.01
    slow_key = METRICS[0].key

    async def fake_metric(_client, spec, _geographies, lang):
        if spec.key == slow_key:
            await asyncio.sleep(0.05)
        return {
            "CA": ProvincialMetric(
                key=spec.key,
                label=spec.label_fr,
                category=spec.category_fr,
                value=100.0,
                unit_kind=spec.unit_kind,
                change_kind=spec.change_kind,
                table_id=spec.table_id,
                table_url="https://example.test/statcan",
            )
        }, None

    from app.services.canada_360 import provincial_statistics_service

    monkeypatch.setattr(
        provincial_statistics_service,
        "_metric_for_provinces",
        fake_metric,
    )

    values, issues = await service._load_macro("fr")

    assert len(values) == len(METRICS) - 1
    assert any("délai interactif dépassé" in issue for issue in issues)


def test_macro_last_good_fills_transient_gap_as_stale() -> None:
    service = Canada360Service()
    first = [
        c360_metric(spec.key, float(index + 1))
        for index, spec in enumerate(METRICS)
    ]
    service._merge_macro_last_good("fr", first)

    merged = service._merge_macro_last_good("fr", first[1:])
    by_key = {metric.key: metric for metric in merged}

    assert len(by_key) == len(METRICS)
    assert by_key[first[0].key].freshness == "stale"


@pytest.mark.asyncio
async def test_province_source_counts_series_not_just_provinces(
    monkeypatch,
) -> None:
    service = Canada360Service()

    async def fake_macro(_lang, **_kwargs):
        return [c360_metric(spec.key) for spec in METRICS], []

    async def fake_rates(_lang):
        return [
            c360_metric("canada_2y"),
            c360_metric("canada_10y"),
            c360_metric("curve_10y_2y"),
        ]

    async def fake_markets(_lang):
        return [
            c360_metric("tsx_composite"),
            c360_metric("usd_cad"),
            c360_metric("wti"),
            c360_metric("gold"),
        ]

    provinces = [
        Canada360Province(
            code=item["code"],
            name=item["fr"],
            status="partial",
            metrics=[
                c360_metric("real_gdp"),
                c360_metric("population"),
            ],
        )
        for item in PROVINCES
    ]

    monkeypatch.setattr(service, "_load_macro", fake_macro)
    monkeypatch.setattr(service, "_load_rates", fake_rates)
    monkeypatch.setattr(service, "_load_markets", fake_markets)
    monkeypatch.setattr(
        service,
        "_provinces_from_cache",
        lambda _lang: (provinces, False),
    )

    snapshot = await service._build("fr")
    source = next(item for item in snapshot.sources if item.key == "provinces")

    assert source.status == "partial"
    assert source.detail.startswith("20/70")
    assert "0/10 provinces complètes" in source.detail


def test_labour_coordinate_resolves_without_age_or_gender_dimensions() -> None:
    metadata = {
        "dimension": [
            {
                "dimensionPositionId": 1,
                "dimensionNameEn": "Geography",
                "member": [
                    {
                        "memberId": 6,
                        "memberNameEn": "Quebec",
                        "memberNameFr": "Québec",
                        "terminated": 0,
                    }
                ],
            },
            {
                "dimensionPositionId": 2,
                "dimensionNameEn": "Labour force characteristics",
                "member": [
                    {
                        "memberId": 7,
                        "memberNameEn": "Unemployment rate",
                        "memberNameFr": "Taux de chômage",
                        "terminated": 0,
                    }
                ],
            },
            {
                "dimensionPositionId": 3,
                "dimensionNameEn": "Data type",
                "member": [
                    {
                        "memberId": 1,
                        "memberNameEn": "Seasonally adjusted",
                        "memberNameFr": "Données désaisonnalisées",
                        "terminated": 0,
                    },
                    {
                        "memberId": 2,
                        "memberNameEn": "Trend-cycle",
                        "memberNameFr": "Tendance-cycle",
                        "terminated": 0,
                    },
                ],
            },
        ]
    }
    spec = next(item for item in METRICS if item.key == "unemployment_rate")

    coordinate = _resolve_coordinate(
        metadata,
        spec,
        PROVINCE_BY_CODE["QC"],
    )

    assert coordinate == "6.7.1.0.0.0.0.0.0.0"
