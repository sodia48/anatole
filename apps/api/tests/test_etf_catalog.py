from __future__ import annotations

from app.data.etf_catalog import ETF_CATALOG


def test_etf_catalog_contains_at_least_one_hundred_funds() -> None:
    assert len(ETF_CATALOG) >= 100


def test_etf_catalog_has_unique_tickers() -> None:
    tickers = [item["ticker"] for item in ETF_CATALOG]
    assert len(tickers) == len(set(tickers))


def test_every_etf_is_groupable_by_sector() -> None:
    required = {
        "ticker",
        "name",
        "provider",
        "category",
        "exposure",
        "region",
    }
    for item in ETF_CATALOG:
        assert required.issubset(item)
        assert all(str(item[field]).strip() for field in required)
