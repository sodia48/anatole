from __future__ import annotations

from datetime import UTC, date, datetime

import pandas as pd
import pytest

from app.services.etf_official_holdings import (
    OfficialEtfComposition,
    parse_vanguard_holdings_payload,
)
from app.services.etf_holdings import (
    Composition,
    EtfHoldingsService,
    extract_quote_changes,
    parse_top_holdings,
)


def test_top_holdings_weights_are_converted_to_percent() -> None:
    frame = pd.DataFrame(
        {
            "Name": [
                "Royal Bank of Canada",
                "Toronto-Dominion Bank",
            ],
            "Holding Percent": [
                0.081,
                0.064,
            ],
        },
        index=[
            "RY.TO",
            "TD.TO",
        ],
    )

    rows = parse_top_holdings(
        frame,
        limit=10,
    )

    assert rows[0]["display_symbol"] == "RY"
    assert rows[0]["weight_percent"] == 8.1
    assert rows[1]["weight_percent"] == 6.4


def test_live_contribution_inputs_are_extracted() -> None:
    dates = pd.to_datetime(
        [
            "2026-07-20",
            "2026-07-21",
        ]
    )
    columns = pd.MultiIndex.from_product(
        [
            ["RY.TO", "TD.TO"],
            ["Close"],
        ]
    )
    history = pd.DataFrame(
        [
            [100.0, 80.0],
            [102.0, 79.2],
        ],
        index=dates,
        columns=columns,
    )

    changes = extract_quote_changes(
        history,
        ["RY.TO", "TD.TO"],
    )

    assert round(
        float(
            changes["RY.TO"][
                "change_percent"
            ]
        ),
        2,
    ) == 2.0
    assert round(
        float(
            changes["TD.TO"][
                "change_percent"
            ]
        ),
        2,
    ) == -1.0


def test_vanguard_vfv_official_holdings_are_parsed_without_invention() -> None:
    payload = {
        "data": {
            "funds": [{"profile": {"fundFullName": "Vanguard S&P 500 Index ETF"}}],
            "borHoldings": [
                {
                    "delayeredHoldings": {
                        "items": [
                            {
                                "issuerName": "NVIDIA Corp.",
                                "marketValuePercentage": 7.54532,
                                "ticker": "NVDA",
                                "securityType": "EQ.STOCK",
                                "gicsSectorDescription": "Information Technology",
                                "bloombergIsoCountry": "US",
                                "effectiveDate": "2026-07-31",
                            },
                            {
                                "issuerName": "Cash",
                                "marketValuePercentage": 0.1,
                                "ticker": None,
                                "securityType": "MM.CP",
                                "effectiveDate": "2026-07-31",
                            },
                        ]
                    }
                }
            ],
        }
    }

    composition = parse_vanguard_holdings_payload(payload, limit=25)

    assert composition.rows[0]["symbol"] == "NVDA"
    assert composition.rows[0]["weight_percent"] == 7.54532
    assert composition.rows[0]["sector"] == "Information Technology"
    assert composition.rows[0]["region"] == "US"
    assert composition.composition_as_of == date(2026, 7, 31)
    assert len(composition.rows) == 1


@pytest.mark.asyncio
async def test_quote_failure_preserves_official_holdings_as_nd(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EtfHoldingsService()
    composition = Composition(
        ticker="VFV",
        normalized_symbol="VFV.TO",
        description=None,
        overview={},
        rows=[
            {
                "symbol": "NVDA",
                "display_symbol": "NVDA",
                "name": "NVIDIA Corp.",
                "weight_percent": 7.5,
                "instrument_type": "equity",
                "sector": "Information Technology",
                "region": "US",
            }
        ],
        sectors={"Information Technology": 7.5},
        regions={"US": 7.5},
        asset_classes={"stockPosition": 100.0},
        fetched_at=datetime.now(UTC),
        source_name="Vanguard Canada",
        source_url="https://www.vanguard.ca/",
        composition_as_of=date(2026, 7, 31),
        official=True,
    )

    async def composition_result(*args: object, **kwargs: object) -> Composition:
        return composition

    def fail_quotes(symbols: list[str]) -> dict[str, object]:
        raise RuntimeError("private diagnostic")

    monkeypatch.setattr(service, "_composition", composition_result)
    monkeypatch.setattr(
        "app.services.etf_holdings._download_quotes_sync",
        fail_quotes,
    )

    snapshot = await service.snapshot("VFV", limit=25)

    assert snapshot.status == "partial"
    assert snapshot.official is True
    assert snapshot.holdings[0].change_percent is None
    assert snapshot.holdings[0].contribution_percent_points is None
    assert snapshot.quoted_holdings is None
    assert snapshot.total_holdings_returned == 1
    assert "RuntimeError" not in (snapshot.message or "")


@pytest.mark.asyncio
async def test_unavailable_holdings_do_not_fabricate_zero_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EtfHoldingsService()

    async def fail_composition(*args: object, **kwargs: object) -> Composition:
        raise RuntimeError("private diagnostic")

    monkeypatch.setattr(service, "_composition", fail_composition)
    snapshot = await service.snapshot("UNKNOWN")

    assert snapshot.status == "unavailable"
    assert snapshot.top_holdings_weight_percent is None
    assert snapshot.quoted_holdings is None
    assert snapshot.total_holdings_returned is None
    assert "RuntimeError" not in (snapshot.message or "")


@pytest.mark.asyncio
async def test_vfv_prefers_official_provider_and_failed_refresh_keeps_last_good(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = EtfHoldingsService()
    official = OfficialEtfComposition(
        name="Vanguard S&P 500 Index ETF",
        rows=[
            {
                "symbol": "NVDA",
                "display_symbol": "NVDA",
                "name": "NVIDIA Corp.",
                "weight_percent": 7.5,
                "instrument_type": "equity",
                "sector": "Information Technology",
                "region": "US",
            }
        ],
        sectors={"Information Technology": 7.5},
        regions={"US": 7.5},
        asset_classes={"stockPosition": 7.5},
        composition_as_of=date(2026, 7, 31),
        source_name="Vanguard Canada",
        source_url="https://www.vanguard.ca/vfv",
    )

    async def official_result(*args: object, **kwargs: object) -> OfficialEtfComposition:
        return official

    monkeypatch.setattr(
        "app.services.etf_holdings.vanguard_canada_holdings_provider.get_composition",
        official_result,
    )
    first = await service._composition(
        "VFV.TO",
        25,
        force_refresh=True,
    )
    assert first.official is True
    assert first.source_name == "Vanguard Canada"

    async def official_failure(*args: object, **kwargs: object) -> OfficialEtfComposition:
        raise RuntimeError("official offline")

    def yahoo_failure(*args: object, **kwargs: object) -> Composition:
        raise RuntimeError("secondary offline")

    monkeypatch.setattr(
        "app.services.etf_holdings.vanguard_canada_holdings_provider.get_composition",
        official_failure,
    )
    monkeypatch.setattr(
        "app.services.etf_holdings._fetch_composition_sync",
        yahoo_failure,
    )
    stale = await service._composition(
        "VFV.TO",
        25,
        force_refresh=True,
    )

    assert stale.rows == first.rows
    assert stale.stale is True
    assert "Dernière composition disponible" in (stale.source_warning or "")
