from app.schemas.options import OptionContract
from datetime import UTC, datetime, timedelta

from app.services.options import OptionsService, _analytics, _apply_black_scholes_metrics


def test_commodity_universe_covers_major_asset_groups() -> None:
    items, status = OptionsService._commodity_universe()
    symbols = {item.symbol for item in items}
    categories = {item.category for item in items}

    assert {"CL", "NG", "GC", "SI", "ZC", "ZS", "LE", "CC", "KC", "LBR", "RS"} <= symbols
    assert len(items) >= 28
    assert {"Energy", "Metals", "Grains", "Oilseeds", "Livestock", "Softs"} <= categories
    assert status.source == "Barchart OnDemand"


def test_option_analytics_put_call_and_atm_iv() -> None:
    contracts = [
        OptionContract(
            symbol="A",
            underlying="TEST",
            market="tsx",
            side="call",
            strike=90,
            expiration="2026-12-18",
            exchange="TEST",
            volume=20,
            open_interest=100,
            implied_volatility=22,
            source="test",
        ),
        OptionContract(
            symbol="B",
            underlying="TEST",
            market="tsx",
            side="call",
            strike=100,
            expiration="2026-12-18",
            exchange="TEST",
            volume=40,
            open_interest=200,
            implied_volatility=20,
            source="test",
        ),
        OptionContract(
            symbol="C",
            underlying="TEST",
            market="tsx",
            side="put",
            strike=100,
            expiration="2026-12-18",
            exchange="TEST",
            volume=20,
            open_interest=100,
            implied_volatility=24,
            source="test",
        ),
        OptionContract(
            symbol="D",
            underlying="TEST",
            market="tsx",
            side="put",
            strike=110,
            expiration="2026-12-18",
            exchange="TEST",
            volume=10,
            open_interest=50,
            implied_volatility=26,
            source="test",
        ),
    ]

    result = _analytics(contracts, 100)

    assert result.contract_count == 4
    assert result.put_call_volume_ratio == 0.5
    assert result.put_call_open_interest_ratio == 0.5
    assert result.atm_implied_volatility == 22
    assert result.max_pain_estimate in {90, 100, 110}


def test_black_scholes_fills_missing_iv_and_greeks() -> None:
    expiry = (datetime.now(UTC).date() + timedelta(days=365)).isoformat()
    contracts = [
        OptionContract(
            symbol="TEST-C",
            underlying="TEST",
            market="tsx",
            side="call",
            strike=100,
            expiration=expiry,
            exchange="Montréal Exchange",
            bid=10.0,
            ask=11.0,
            last=10.5,
            source="Montréal Exchange",
        )
    ]

    enriched = _apply_black_scholes_metrics(
        contracts,
        underlying_price=100.0,
        risk_free_rate=0.03,
    )

    item = contracts[0]
    assert enriched == 1
    assert item.implied_volatility is not None
    assert 5 < item.implied_volatility < 100
    assert item.delta is not None
    assert item.gamma is not None
    assert item.theta is not None
    assert item.vega is not None
