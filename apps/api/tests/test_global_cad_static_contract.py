from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_canada360_and_terminal_no_longer_label_commodity_quotes_usd() -> None:
    canada = (
        ROOT / "apps/api/app/services/canada_360.py"
    ).read_text(encoding="utf-8")
    client = (
        ROOT / "apps/web/components/canada/Canada360Client.tsx"
    ).read_text(encoding="utf-8")
    terminal = (
        ROOT / "apps/api/app/services/terminal_drivers.py"
    ).read_text(encoding="utf-8")

    assert '"usd_per_barrel"' not in canada
    assert '"usd_per_ounce"' not in canada
    assert "$ US/b" not in client
    assert "$ US/oz" not in client

    for symbol in ("CL=F", "BZ=F", "GC=F", "HG=F", "NG=F"):
        line = next(
            line for line in terminal.splitlines()
            if f'"{symbol}"' in line
        )
        assert '"CAD"' in line


def test_quote_and_fundamental_boundaries_use_cad_normalizer() -> None:
    quote_service = (
        ROOT / "apps/api/app/services/session_quotes.py"
    ).read_text(encoding="utf-8")
    history_service = (
        ROOT / "apps/api/app/services/market_data.py"
    ).read_text(encoding="utf-8")
    fundamentals = (
        ROOT / "apps/api/app/services/fundamentals.py"
    ).read_text(encoding="utf-8")

    assert "currency_conversion_service.quote_to_cad" in quote_service
    assert "currency_conversion_service.candles_to_cad" in history_service
    assert fundamentals.count(
        "currency_conversion_service.fundamental_to_cad"
    ) >= 3
