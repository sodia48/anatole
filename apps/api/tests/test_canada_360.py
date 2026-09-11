from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canada_360 import (
    Canada360Metric,
    Canada360Province,
    Canada360Snapshot,
    Canada360SourceStatus,
)
from app.schemas.provincial_statistics import (
    ProvincialMetric,
    ProvincialStatisticsSnapshot,
)
from app.services.canada_360 import Canada360Service, canada_360_service
from app.services.market_data import market_data_service
from app.services.provincial_statistics import (
    METRICS,
    provincial_statistics_service,
)


def metric(key: str, value: float = 1.0) -> Canada360Metric:
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
async def test_canada_macro_uses_canada_geography_not_provincial_average(
    monkeypatch,
) -> None:
    service = Canada360Service()
    seen_codes: list[list[str]] = []

    async def fake_metric_for_provinces(
        _client,
        spec,
        geographies,
        lang,
    ):
        seen_codes.append([item["code"] for item in geographies])
        return {
            "CA": ProvincialMetric(
                key=spec.key,
                label=spec.label_en if lang == "en" else spec.label_fr,
                category=spec.category_en if lang == "en" else spec.category_fr,
                value=100.0,
                previous_value=99.0,
                change=1.0,
                change_kind=spec.change_kind,
                unit_kind=spec.unit_kind,
                reference_period="2026-08",
                table_id=spec.table_id,
                table_url="https://www150.statcan.gc.ca/",
            )
        }, None

    monkeypatch.setattr(
        provincial_statistics_service,
        "_metric_for_provinces",
        fake_metric_for_provinces,
    )

    values, issues = await service._load_macro("fr")

    assert not issues
    assert len(values) == len(METRICS)
    assert seen_codes == [["CA"]] * len(METRICS)
    assert all(item.official for item in values)


@pytest.mark.asyncio
async def test_missing_market_quotes_never_become_zero(
    monkeypatch,
) -> None:
    service = Canada360Service()

    async def no_quotes(_symbols, *, deadline_seconds=None):
        assert deadline_seconds == service.market_deadline_seconds
        return []

    monkeypatch.setattr(
        market_data_service,
        "get_quotes",
        no_quotes,
    )

    values = await service._load_markets("fr")
    assert values == []


@pytest.mark.asyncio
async def test_source_failure_returns_partial_snapshot(
    monkeypatch,
) -> None:
    service = Canada360Service()

    async def fake_macro(_lang):
        return [metric("inflation_yoy", 2.1)], []

    async def failed_rates(_lang):
        raise RuntimeError("BoC unavailable")

    async def fake_markets(_lang):
        return [metric("tsx_composite", 32100.0)]

    monkeypatch.setattr(service, "_load_macro", fake_macro)
    monkeypatch.setattr(service, "_load_rates", failed_rates)
    monkeypatch.setattr(service, "_load_markets", fake_markets)
    monkeypatch.setattr(
        service,
        "_provinces_from_cache",
        lambda _lang: (
            [
                Canada360Province(
                    code="QC",
                    name="Québec",
                    status="partial",
                    metrics=[metric("unemployment_rate", 5.2)],
                )
            ],
            False,
        ),
    )

    snapshot = await service.get_snapshot("fr", force=True)

    assert snapshot.status == "partial"
    assert snapshot.macro[0].value == 2.1
    assert snapshot.markets[0].value == 32100.0
    assert snapshot.rates == []
    assert any(
        item.key == "bank-of-canada" and item.status == "unavailable"
        for item in snapshot.sources
    )
    assert any("BoC" in issue for issue in snapshot.issues)


def test_canada_360_route_is_registered(monkeypatch) -> None:
    now = datetime.now(UTC)

    async def fake_snapshot(lang="fr", *, force=False):
        return Canada360Snapshot(
            language=lang,
            status="partial",
            macro=[metric("inflation_yoy", 2.0)],
            rates=[],
            markets=[],
            provinces=[],
            sources=[
                Canada360SourceStatus(
                    key="statcan",
                    label="Statistique Canada",
                    status="partial",
                )
            ],
            issues=[],
            generated_at=now,
            refresh_after_seconds=15,
        )

    monkeypatch.setattr(
        canada_360_service,
        "get_snapshot",
        fake_snapshot,
    )

    response = TestClient(app).get("/api/v1/canada/overview?lang=en")
    assert response.status_code == 200
    payload = response.json()
    assert payload["language"] == "en"
    assert payload["macro"][0]["value"] == 2.0


def test_provincial_statistics_route_is_registered(monkeypatch) -> None:
    async def fake_snapshot(region=None, lang="fr", *, force=False):
        return ProvincialStatisticsSnapshot(
            requested_region="QC",
            language=lang,
            provinces=[],
            source_statuses=[],
            generated_at=datetime.now(UTC),
            refresh_after_seconds=1800,
        )

    monkeypatch.setattr(
        provincial_statistics_service,
        "get_snapshot",
        fake_snapshot,
    )

    response = TestClient(app).get(
        "/api/v1/discovery/provincial-statistics?region=QC&lang=fr"
    )
    assert response.status_code == 200
    assert response.json()["requested_region"] == "QC"
