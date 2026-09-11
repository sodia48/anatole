from __future__ import annotations

from app.services.provincial_statistics import (
    METRICS,
    PROVINCE_BY_CODE,
    _inflation_yoy_pair,
    _resolve_coordinate,
)


def test_inflation_yoy_is_derived_from_cpi_level_without_statistics_dimension() -> None:
    points = []
    for index in range(14):
        points.append(
            {
                "refPer": f"2025-{index + 1:02d}",
                "value": 100 + index,
                "scalarFactorCode": 0,
            }
        )

    current, previous = _inflation_yoy_pair(points)

    assert current is not None
    assert previous is not None
    assert round(current, 6) == round((113 / 101 - 1) * 100, 6)
    assert round(previous, 6) == round((112 / 100 - 1) * 100, 6)


def test_unemployment_resolves_data_type_and_gender_dimensions() -> None:
    metadata = {
        "dimension": [
            {
                "dimensionPositionId": 1,
                "dimensionNameEn": "Geography",
                "dimensionNameFr": "Géographie",
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
                "dimensionNameFr": "Caractéristiques de la population active",
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
                "dimensionNameEn": "Gender",
                "dimensionNameFr": "Genre",
                "member": [
                    {
                        "memberId": 1,
                        "memberNameEn": "Both sexes",
                        "memberNameFr": "Les deux sexes",
                        "terminated": 0,
                    }
                ],
            },
            {
                "dimensionPositionId": 4,
                "dimensionNameEn": "Age group",
                "dimensionNameFr": "Groupe d'âge",
                "member": [
                    {
                        "memberId": 1,
                        "memberNameEn": "15 years and over",
                        "memberNameFr": "15 ans et plus",
                        "terminated": 0,
                    }
                ],
            },
            {
                "dimensionPositionId": 5,
                "dimensionNameEn": "Data type",
                "dimensionNameFr": "Type de données",
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

    spec = next(metric for metric in METRICS if metric.key == "unemployment_rate")
    coordinate = _resolve_coordinate(metadata, spec, PROVINCE_BY_CODE["QC"])

    assert coordinate == "6.7.1.1.1.0.0.0.0.0"


def test_inflation_spec_no_longer_requires_statistics_dimension() -> None:
    spec = next(metric for metric in METRICS if metric.key == "inflation_yoy")

    assert spec.latest_n == 14
    assert len(spec.selectors) == 1
    assert "product" in spec.selectors[0].dimension_terms
