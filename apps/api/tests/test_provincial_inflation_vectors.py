from __future__ import annotations

import httpx
import pytest

from app.services.provincial_statistics import (
    CPI_ALL_ITEMS_VECTOR_BY_CODE,
    METRICS,
    PROVINCE_BY_CODE,
    ProvincialStatisticsService,
)


def response(vector_id: int, values: list[float]) -> dict:
    points = []
    for index, value in enumerate(values):
        month = index + 1
        points.append(
            {
                "refPerRaw": f"2025-{month:02d}-01",
                "value": value,
                "scalarFactorCode": 0,
                "releaseTime": "2026-09-01T08:30:00Z",
            }
        )
    return {
        "status": "SUCCESS",
        "object": {
            "vectorId": vector_id,
            "vectorDataPoint": points,
        },
    }


def test_official_cpi_vectors_cover_canada_and_ten_provinces() -> None:
    assert set(CPI_ALL_ITEMS_VECTOR_BY_CODE) == {
        "CA",
        "NL",
        "PE",
        "NS",
        "NB",
        "QC",
        "ON",
        "MB",
        "SK",
        "AB",
        "BC",
    }


@pytest.mark.asyncio
async def test_inflation_maps_by_vector_id_not_response_order(
    monkeypatch,
) -> None:
    service = ProvincialStatisticsService()
    spec = next(item for item in METRICS if item.key == "inflation_yoy")

    qc_values = [100.0 + index for index in range(14)]
    on_values = [120.0 + index for index in range(14)]

    async def fake_post(_client, method, body):
        assert method == "getDataFromVectorsAndLatestNPeriods"
        assert all(item["latestN"] == 25 for item in body)
        return [
            response(
                CPI_ALL_ITEMS_VECTOR_BY_CODE["ON"],
                on_values,
            ),
            response(
                CPI_ALL_ITEMS_VECTOR_BY_CODE["QC"],
                qc_values,
            ),
        ]

    monkeypatch.setattr(service, "_post", fake_post)

    async with httpx.AsyncClient() as client:
        metrics, issue = await service._inflation_for_provinces(
            client,
            spec,
            [
                PROVINCE_BY_CODE["QC"],
                PROVINCE_BY_CODE["ON"],
            ],
            "fr",
        )

    assert issue is None
    assert set(metrics) == {"QC", "ON"}

    expected_qc = (113.0 / 101.0 - 1.0) * 100.0
    expected_qc_previous = (112.0 / 100.0 - 1.0) * 100.0

    assert round(metrics["QC"].value or 0.0, 8) == round(expected_qc, 8)
    assert round(metrics["QC"].previous_value or 0.0, 8) == round(
        expected_qc_previous,
        8,
    )
    assert round(metrics["QC"].change or 0.0, 8) == round(
        expected_qc - expected_qc_previous,
        8,
    )


def test_inflation_source_is_official_cpi_index_table() -> None:
    spec = next(item for item in METRICS if item.key == "inflation_yoy")
    assert spec.table_id == "18-10-0004-01"
    assert spec.simple_view_pid == "1810000401"
