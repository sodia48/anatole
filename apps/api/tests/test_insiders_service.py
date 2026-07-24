import pandas as pd

from app.services.insiders import (
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
