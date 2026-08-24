from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app.core.config import settings
from app.main import app
from app.schemas.backtest import BacktestRequest
from app.schemas.stocks import Candle
from app.services.anatole_script import compile_script, validate_script
from app.services.backtest import BacktestService, StrategySignals


SCRIPT = '''strategy "SMA 2/3"
fast = sma(close, 2)
slow = sma(close, 3)
enter_long(crossover(fast, slow))
exit_long(crossunder(fast, slow))
plot(fast)
plot(slow)'''


def sample() -> list[Candle]:
    return [
        Candle(time=1, open=100, high=102, low=98, close=100, volume=100),
        Candle(time=2, open=110, high=122, low=108, close=120, volume=110),
        Candle(time=3, open=90, high=93, low=80, close=85, volume=120),
        Candle(time=4, open=86, high=88, low=82, close=84, volume=130),
    ]


def test_signal_on_close_executes_only_at_next_open() -> None:
    request = BacktestRequest(
        ticker="RY",
        strategy="sma_crossover",
        strategy_parameters={"fast": 2, "slow": 3},
    )
    signals = StrategySignals(
        enter_long=[True, False, False, False],
        exit_long=[False, True, False, False],
        entry_reason="test enter",
        exit_reason="test exit",
    )
    result = BacktestService()._simulate(request, sample(), signals)
    assert result.trades_count == 1
    trade = result.trades[0]
    assert trade.entry_time == 2
    assert trade.entry_price == 110
    assert trade.exit_time == 3
    assert trade.exit_price == 90
    assert "close[t]" in result.execution_convention
    assert "open[t+1]" in result.execution_convention


def test_commission_and_slippage_reduce_equity_and_are_reported() -> None:
    signals = StrategySignals(
        enter_long=[True, False, False, False],
        exit_long=[False, True, False, False],
        entry_reason="test enter",
        exit_reason="test exit",
    )
    plain = BacktestService()._simulate(
        BacktestRequest(ticker="RY", strategy="sma_crossover"),
        sample(),
        signals,
    )
    costly = BacktestService()._simulate(
        BacktestRequest(
            ticker="RY",
            strategy="sma_crossover",
            commission=9,
            slippage=1,
        ),
        sample(),
        signals,
    )
    assert costly.final_equity < plain.final_equity
    assert costly.trades[0].commission == 18
    assert costly.trades[0].slippage == 1
    assert costly.max_drawdown_percent >= 0


def test_anatole_script_compiles_to_bounded_ast() -> None:
    validation = validate_script(SCRIPT)
    assert validation.valid is True
    assert validation.kind == "strategy"
    assert validation.indicators_count == 2
    compiled = compile_script(SCRIPT, sample())
    assert len(compiled.enter_long) == len(sample())
    assert set(compiled.plots) == {"fast", "slow"}


@pytest.mark.parametrize("payload", [
    'strategy "x"\nvalue = __import__("os")',
    'strategy "x"\nvalue = eval(close)',
    'strategy "x"\nvalue = open(close)',
    'strategy "x"\nvalue = fetch(close)',
    'strategy "x"\nvalue = close.__class__',
])
def test_anatole_script_rejects_native_code_and_capabilities(payload: str) -> None:
    validation = validate_script(payload)
    assert validation.valid is False
    assert validation.diagnostics


def test_anatole_script_enforces_statement_limit() -> None:
    source = 'strategy "too large"\n' + "\n".join(
        f"value{index} = sma(close, 2)" for index in range(121)
    )
    validation = validate_script(source)
    assert validation.valid is False


def test_backtest_routes_use_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    try:
        with TestClient(app) as client:
            validation = client.post(
                "/api/v1/backtest/script/validate",
                json={"source": SCRIPT},
            )
            assert validation.status_code == 200
            assert validation.json()["valid"] is True
            response = client.post(
                "/api/v1/backtest",
                json={
                    "ticker": "RY",
                    "range": "1y",
                    "interval": "1d",
                    "strategy": "sma_crossover",
                    "strategy_parameters": {"fast": 5, "slow": 20},
                    "initial_capital": 100000,
                    "position_size": 50,
                    "commission": 1,
                    "slippage": 0.02,
                    "direction": "long",
                },
            )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["ticker"] == "RY"
        assert len(payload["equity_curve"]) == 260
        assert payload["execution_convention"].startswith("Un signal")
    finally:
        settings.market_data_provider = original
