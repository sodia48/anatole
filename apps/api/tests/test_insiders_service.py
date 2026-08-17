import pytest
import pandas as pd

from app.schemas.ipo_insiders import InsiderTrade
from app.services.insiders import (
    InsiderService,
    infer_transaction_type,
    parse_sec_ownership_xml,
    parse_yahoo_insider_frame,
    summarize_trades,
)

SEC_XML = """<?xml version="1.0"?>
<ownershipDocument>
<periodOfReport>2026-07-20</periodOfReport>
<issuer>
<issuerName>Example Corp</issuerName>
<issuerTradingSymbol>EXM</issuerTradingSymbol>
</issuer>
<reportingOwner>
<reportingOwnerId><rptOwnerName>DOE JOHN</rptOwnerName></reportingOwnerId>
<reportingOwnerRelationship>
<isDirector>1</isDirector>
<isOfficer>1</isOfficer>
<officerTitle>Chief Executive Officer</officerTitle>
</reportingOwnerRelationship>
</reportingOwner>
<nonDerivativeTable>
<nonDerivativeTransaction>
<transactionDate><value>2026-07-18</value></transactionDate>
<transactionCoding><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts>
<transactionShares><value>10000</value></transactionShares>
<transactionPricePerShare><value>12.50</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
</transactionAmounts>
<postTransactionAmounts>
<sharesOwnedFollowingTransaction><value>50000</value></sharesOwnedFollowingTransaction>
</postTransactionAmounts>
<ownershipNature>
<directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
</ownershipNature>
</nonDerivativeTransaction>
</nonDerivativeTable>
</ownershipDocument>
"""


def test_yahoo_frame_is_normalized() -> None:
    frame = pd.DataFrame([{
        "Start Date": "2026-07-10",
        "Insider": "Jane Doe",
        "Position": "Director",
        "Transaction": "Purchase",
        "Shares": 3000,
        "Value": 292410,
        "Ownership": "Direct",
    }])
    trades = parse_yahoo_insider_frame(
        frame,
        ticker="RY",
        company="Royal Bank of Canada",
    )
    assert len(trades) == 1
    assert trades[0].transaction_type == "buy"
    assert round(float(trades[0].price or 0), 2) == 97.47
    assert trades[0].official_source is False


def test_sec_form_4_and_summary() -> None:
    trades = parse_sec_ownership_xml(
        SEC_XML,
        source_url="https://www.sec.gov/example.xml",
    )
    assert len(trades) == 1
    assert trades[0].ticker == "EXM"
    assert trades[0].value == 125000
    assert trades[0].holdings_after == 50000
    assert trades[0].official_source is True
    summary = summarize_trades(trades)
    assert summary.buys == 1
    assert summary.net_value == 125000
    assert summary.buy_ratio_percent == 100


def test_inference() -> None:
    assert infer_transaction_type(code="S")[0] == "sell"
    assert infer_transaction_type("Option Exercise")[0] == "exercise"



def test_yahoo_frame_accepts_alternate_columns() -> None:
    frame = pd.DataFrame([{
        "Latest Transaction": "2026-07-24",
        "Insider Trading": "Alex Smith",
        "Insider Position": "Officer",
        "Transaction Type": "Sale",
        "Shares Traded": 1250,
        "Total Value": 125000,
        "Ownership": "Direct",
    }])
    trades = parse_yahoo_insider_frame(
        frame,
        ticker="TD",
        company="Toronto-Dominion Bank",
    )
    assert len(trades) == 1
    assert trades[0].insider_name == "Alex Smith"
    assert trades[0].transaction_type == "sell"
    assert trades[0].shares == 1250
    assert trades[0].value == 125000



@pytest.mark.asyncio
async def test_preview_scan_does_not_expand_to_full_directory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = InsiderService()
    calls: list[str] = []

    async def empty_ticker(
        ticker: str,
        company: str,
        *,
        days: int,
        force_refresh: bool = False,
    ) -> list[InsiderTrade]:
        calls.append(ticker)
        return []

    monkeypatch.setattr(
        service,
        "canadian_ticker",
        empty_ticker,
    )

    snapshot = await service.snapshot(
        market="canada",
        ticker=None,
        days=30,
        scan_limit=8,
        result_limit=220,
        force_refresh=True,
    )

    assert snapshot.scanned_symbols == 8
    assert len(calls) == 8
    assert snapshot.trades == []


@pytest.mark.asyncio
async def test_full_scan_can_expand_when_initial_group_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = InsiderService()
    calls: list[str] = []

    async def empty_ticker(
        ticker: str,
        company: str,
        *,
        days: int,
        force_refresh: bool = False,
    ) -> list[InsiderTrade]:
        calls.append(ticker)
        return []

    monkeypatch.setattr(
        service,
        "canadian_ticker",
        empty_ticker,
    )

    snapshot = await service.snapshot(
        market="canada",
        ticker=None,
        days=30,
        scan_limit=24,
        result_limit=220,
        force_refresh=True,
    )

    assert snapshot.scanned_symbols == 40
    assert len(calls) == 40
