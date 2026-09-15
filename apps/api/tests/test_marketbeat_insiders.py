from __future__ import annotations

from datetime import date

import pytest

from app.services.insiders import (
    MarketBeatInsiderService,
    ProviderTickerResult,
    SEDI_URL,
    parse_marketbeat_insider_html,
)


MARKETBEAT_HTML = """
<html>
  <body>
    <h2>Suncor Energy (TSE:SU) Insider Buying and Selling Activity</h2>
    <table>
      <thead>
        <tr>
          <th>Transaction Date</th>
          <th>Insider</th>
          <th>Buy/Sell</th>
          <th>Number of Shares</th>
          <th>Average Share Price</th>
          <th>Total Transaction</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>9/8/2026</td>
          <td>Adam Husain Albeldawi<br/>Insider</td>
          <td>Sell</td>
          <td>1,173</td>
          <td>C$95.01</td>
          <td>C$111,446.73</td>
          <td></td>
        </tr>
        <tr>
          <td>8/1/2026</td>
          <td>Example Director<br/>Director</td>
          <td>Buy</td>
          <td>500</td>
          <td>C$90.00</td>
          <td>C$45,000.00</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
"""


def test_marketbeat_parser_keeps_explicit_cad_and_sedi_verification() -> None:
    trades = parse_marketbeat_insider_html(
        MARKETBEAT_HTML,
        ticker="SU",
        company="Suncor Energy",
        source_url="https://www.marketbeat.com/stocks/TSE/SU/insider-trades/",
    )

    assert len(trades) == 2
    sell = trades[0]
    assert sell.trade_date == date(2026, 9, 8)
    assert sell.insider_name == "Adam Husain Albeldawi"
    assert sell.role == "Insider"
    assert sell.transaction_type == "sell"
    assert sell.shares == 1173
    assert sell.price == pytest.approx(95.01)
    assert sell.value == pytest.approx(111446.73)
    assert sell.price_currency == "CAD"
    assert sell.value_currency == "CAD"
    assert sell.currency_source == "source"
    assert sell.source_name == "MarketBeat public"
    assert sell.official_source is False
    assert sell.regulatory_source_name == "SEDI"
    assert sell.official_verification_url == SEDI_URL


@pytest.mark.asyncio
async def test_canada_snapshot_exposes_only_marketbeat_and_sedi(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = MarketBeatInsiderService()
    trade = parse_marketbeat_insider_html(
        MARKETBEAT_HTML,
        ticker="SU",
        company="Suncor Energy",
    )[0]

    async def fake_marketbeat(
        ticker: str,
        company: str,
        *,
        days: int,
        force_refresh: bool,
    ) -> ProviderTickerResult:
        del ticker, company, days, force_refresh
        return ProviderTickerResult(
            trades=[trade],
            succeeded=True,
            detail="fixture",
        )

    async def keep_prices(trades):
        return trades

    monkeypatch.setattr(service, "marketbeat_ticker", fake_marketbeat)
    monkeypatch.setattr(
        "app.services.insiders.validate_canadian_trade_prices",
        keep_prices,
    )

    snapshot = await service.snapshot(
        market="canada",
        ticker="SU",
        days=180,
        scan_limit=1,
        result_limit=20,
    )

    assert snapshot.trades
    assert [source.source for source in snapshot.sources] == [
        "MarketBeat public",
        "SEDI — registre officiel",
    ]
    assert all("Finnhub" not in source.source for source in snapshot.sources)
    assert all("Yahoo" not in source.source for source in snapshot.sources)


@pytest.mark.asyncio
async def test_us_snapshot_still_delegates_to_sec(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = MarketBeatInsiderService()

    async def fake_us_radar(*, days: int, limit: int):
        del days, limit
        return [], 3

    monkeypatch.setattr(service, "us_radar", fake_us_radar)

    snapshot = await service.snapshot(
        market="us",
        ticker=None,
        days=180,
        scan_limit=3,
        result_limit=20,
    )

    assert snapshot.market == "États-Unis"
    assert snapshot.sources[0].source == "SEC EDGAR"
