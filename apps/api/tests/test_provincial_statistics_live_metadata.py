from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from app.schemas.provincial_statistics import (
    ProvincialMetric,
    ProvincialProfile,
    ProvincialStatisticsSnapshot,
)
from app.services.canada_360 import Canada360Service
from app.services.provincial_statistics import (
    METRICS,
    PROVINCES,
    PROVINCE_BY_CODE,
    ProvincialStatisticsService,
    _resolve_coordinate,
)


FIXTURES = Path(__file__).with_name("fixtures")
GEOGRAPHY_MEMBER_IDS = {
    "NL": 2,
    "PE": 3,
    "NS": 4,
    "NB": 5,
    "QC": 6,
    "ON": 7,
    "MB": 8,
    "SK": 9,
    "AB": 10,
    "BC": 11,
}


def load_metadata(product_id: int) -> dict:
    path = FIXTURES / f"statcan_{product_id}_metadata.json"
    return json.loads(path.read_text(encoding="utf-8"))


def metric_spec(key: str):
    return next(item for item in METRICS if item.key == key)


def test_live_labour_metadata_selects_every_dimension_by_name() -> None:
    metadata = load_metadata(14100287)
    # WDS dimension array order is not the coordinate contract. Position IDs are.
    metadata["dimension"].reverse()

    unemployment = metric_spec("unemployment_rate")
    employment = metric_spec("employment")

    for code, geography_id in GEOGRAPHY_MEMBER_IDS.items():
        province = PROVINCE_BY_CODE[code]
        assert _resolve_coordinate(metadata, unemployment, province) == (
            f"{geography_id}.7.1.1.1.1.0.0.0.0"
        )
        assert _resolve_coordinate(metadata, employment, province) == (
            f"{geography_id}.3.1.1.1.1.0.0.0.0"
        )


def test_live_gdp_metadata_selects_market_prices_and_chained_2017() -> None:
    metadata = load_metadata(36100222)
    metadata["dimension"].reverse()
    real_gdp = metric_spec("real_gdp")

    for code, geography_id in GEOGRAPHY_MEMBER_IDS.items():
        assert _resolve_coordinate(
            metadata,
            real_gdp,
            PROVINCE_BY_CODE[code],
        ) == f"{geography_id}.1.38.0.0.0.0.0.0.0"


def wds_response(
    coordinate: str,
    vector_id: int,
    previous: float,
    current: float,
    *,
    scalar: int = 0,
) -> dict:
    return {
        "status": "SUCCESS",
        "object": {
            "coordinate": coordinate,
            "vectorId": vector_id,
            "vectorDataPoint": [
                {
                    "refPerRaw": "2025-01-01",
                    "value": previous,
                    "scalarFactorCode": scalar,
                    "releaseTime": "2026-01-01T08:30:00Z",
                },
                {
                    "refPerRaw": "2026-01-01",
                    "value": current,
                    "scalarFactorCode": scalar,
                    "releaseTime": "2026-09-01T08:30:00Z",
                },
            ],
        },
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("key", "qc_coordinate", "on_coordinate", "qc_values", "on_values", "scalar"),
    (
        (
            "unemployment_rate",
            "6.7.1.1.1.1.0.0.0.0",
            "7.7.1.1.1.1.0.0.0.0",
            (5.5, 5.6),
            (6.8, 6.9),
            0,
        ),
        (
            "real_gdp",
            "6.1.38.0.0.0.0.0.0.0",
            "7.1.38.0.0.0.0.0.0.0",
            (475_941, 484_064),
            (941_547, 956_994),
            6,
        ),
    ),
)
async def test_wds_vectors_keep_their_coordinate_periods_values_and_change(
    monkeypatch,
    key: str,
    qc_coordinate: str,
    on_coordinate: str,
    qc_values: tuple[float, float],
    on_values: tuple[float, float],
    scalar: int,
) -> None:
    service = ProvincialStatisticsService()
    spec = metric_spec(key)
    metadata = load_metadata(spec.product_id)

    async def fake_metadata(_client, _product_id):
        return metadata

    async def fake_post(_client, method, _body):
        assert method == "getDataFromCubePidCoordAndLatestNPeriods"
        # Reverse the requested order to prove vector association uses coordinate.
        return [
            wds_response(on_coordinate, 2002, *on_values, scalar=scalar),
            wds_response(qc_coordinate, 1001, *qc_values, scalar=scalar),
        ]

    monkeypatch.setattr(service, "_metadata", fake_metadata)
    monkeypatch.setattr(service, "_post", fake_post)

    async with httpx.AsyncClient() as client:
        result, issue = await service._metric_for_provinces(
            client,
            spec,
            [PROVINCE_BY_CODE["QC"], PROVINCE_BY_CODE["ON"]],
            "fr",
        )

    assert issue is None
    multiplier = 10**scalar
    assert result["QC"].previous_value == qc_values[0] * multiplier
    assert result["QC"].value == qc_values[1] * multiplier
    assert result["ON"].previous_value == on_values[0] * multiplier
    assert result["ON"].value == on_values[1] * multiplier
    assert result["QC"].reference_period == "2026-01-01"
    assert result["QC"].previous_reference_period == "2025-01-01"
    assert result["QC"].change is not None
    assert result["ON"].change is not None


def test_canada360_exposes_four_core_metrics_for_all_provinces(
    monkeypatch,
) -> None:
    profiles = []
    core_keys = (
        "inflation_yoy",
        "population",
        "unemployment_rate",
        "real_gdp",
    )
    for province in PROVINCES:
        profiles.append(
            ProvincialProfile(
                code=province["code"],
                name=province["fr"],
                metrics=[
                    ProvincialMetric(
                        key=key,
                        label=key,
                        category="test",
                        value=float(index + 1),
                        table_id="00-00-0000-00",
                        table_url="https://www.statcan.gc.ca/",
                    )
                    for index, key in enumerate(core_keys)
                ],
            )
        )
    snapshot = ProvincialStatisticsSnapshot(
        requested_region="ALL",
        language="fr",
        provinces=profiles,
        generated_at=datetime.now(UTC),
    )

    from app.services.canada_360 import provincial_statistics_service

    monkeypatch.setattr(
        provincial_statistics_service,
        "peek_snapshot",
        lambda **_kwargs: (snapshot, False),
    )

    provinces, stale = Canada360Service()._provinces_from_cache("fr")

    assert stale is False
    assert len(provinces) == 10
    for province in provinces:
        keys = {metric.key for metric in province.metrics}
        assert set(core_keys).issubset(keys)


@pytest.mark.asyncio
async def test_provincial_snapshot_bounds_wds_table_fanout(
    monkeypatch,
) -> None:
    service = ProvincialStatisticsService()
    active = 0
    maximum_active = 0

    async def fake_metric(_client, _spec, _provinces, _lang):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        try:
            await asyncio.sleep(0)
            return {}, None
        finally:
            active -= 1

    monkeypatch.setattr(service, "_metric_for_provinces", fake_metric)

    await service._build("QC", "fr")

    assert maximum_active == service.metric_concurrency == 2
    assert maximum_active < len(METRICS)
