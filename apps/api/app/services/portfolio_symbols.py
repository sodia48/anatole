from __future__ import annotations


def portfolio_provider_ticker(symbol: str, market: str) -> str:
    """Route a portfolio symbol without changing legacy Canadian defaults."""
    clean = symbol.strip().upper()
    if market == "US":
        return f"US:{clean}"
    if market == "INTL":
        return f"INTL:{clean}"
    return clean
