from __future__ import annotations

from app.services.provincial_statistics import (
    METRICS,
    PROVINCE_BY_CODE,
    _resolve_coordinate,
    _responses_by_code,
)


def test_wds_responses_are_mapped_by_coordinate_not_response_order() -> None:
    coordinate_to_code = {
        "1.10.0.0.0.0.0.0.0.0": "QC",
        "1.20.0.0.0.0.0.0.0.0": "ON",
    }
    responses = [
        {
            "object": {
                "coordinate": "1.20.0.0.0.0.0.0.0.0",
                "vectorDataPoint": [{"value": 200}],
            }
        },
        {
            "object": {
                "coordinate": "1.10.0.0.0.0.0.0.0.0",
                "vectorDataPoint": [{"value": 100}],
            }
        },
    ]

    matched = _responses_by_code(responses, coordinate_to_code)

    assert set(matched) == {"QC", "ON"}
    assert matched["QC"]["object"]["coordinate"] == "1.10.0.0.0.0.0.0.0.0"
    assert matched["ON"]["object"]["coordinate"] == "1.20.0.0.0.0.0.0.0.0"


def test_real_gdp_resolves_2017_chained_dollars_dimension() -> None:
    metadata = {
        "dimension": [
            {
                "dimensionPositionId": 1,
                "dimensionNameEn": "Geography",
                "dimensionNameFr": "Géographie",
                "member": [
                    {
                        "memberId": 10,
                        "memberNameEn": "Quebec",
                        "memberNameFr": "Québec",
                        "terminated": 0,
                    }
                ],
            },
            {
                "dimensionPositionId": 2,
                "dimensionNameEn": "Estimates",
                "dimensionNameFr": "Estimations",
                "member": [
                    {
                        "memberId": 4,
                        "memberNameEn": "Gross domestic product at market prices",
                        "memberNameFr": "Produit intérieur brut aux prix du marché",
                        "terminated": 0,
                    }
                ],
            },
            {
                "dimensionPositionId": 3,
                "dimensionNameEn": "Prices",
                "dimensionNameFr": "Prix",
                "member": [
                    {
                        "memberId": 7,
                        "memberNameEn": "2017 chained dollars",
                        "memberNameFr": "Dollars enchaînés de 2017",
                        "terminated": 0,
                    }
                ],
            },
        ]
    }
    real_gdp = next(metric for metric in METRICS if metric.key == "real_gdp")

    coordinate = _resolve_coordinate(
        metadata,
        real_gdp,
        PROVINCE_BY_CODE["QC"],
    )

    assert coordinate == "10.4.7.0.0.0.0.0.0.0"
