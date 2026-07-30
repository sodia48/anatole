from app.core.resilience import shared_http_client
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    TSXCompositeUniverseService,
)


def sample_csv(count: int = 150) -> bytes:
    rows = [
        "iShares Core S&P/TSX Capped Composite Index ETF",
        'Fund Holdings as of,"Jul 28, 2026"',
        "Ticker,Name,Sector,Weight (%),Exchange,Currency,Location of Risk,ISIN",
    ]
    rows.extend(
        f'T{i:03d},Company {i},Financials,{1 / count:.6f},Toronto Stock Exchange,CAD,Canada,CA{i:010d}'
        for i in range(count)
    )
    rows.append("CAD,Cash and/or Derivatives,Cash,0.10,-,CAD,Canada,-")
    return ("\n".join(rows) + "\n").encode("utf-8")


def test_composite_parser_reads_all_equities_and_as_of_date() -> None:
    service = TSXCompositeUniverseService()
    constituents, as_of = service._parse(sample_csv())

    assert len(constituents) == 150
    assert as_of == "2026-07-28"
    assert constituents[0].ticker == "T000"
    assert all(item.sector == "Financials" for item in constituents)
    assert all(item.currency == "CAD" for item in constituents)


async def test_composite_universe_uses_stale_cache_on_source_failure(
    monkeypatch,
) -> None:
    service = TSXCompositeUniverseService()
    cached = [
        CompositeConstituent(
            ticker=f"T{i:03d}",
            name=f"Company {i}",
            sector="Financials",
            weight=0.5,
        )
        for i in range(150)
    ]
    service._cache = (0.0, cached)

    async def fail_request(*args, **kwargs):
        raise RuntimeError("temporary source failure")

    monkeypatch.setattr(shared_http_client, "request", fail_request)

    result = await service.get_constituents()
    assert result == cached
