from app.services.sec_edgar import (
    SECEdgarFinancialsProvider,
)


def fact(
    value: float,
    *,
    start: str | None,
    end: str,
    form: str,
    filed: str,
    accession: str,
) -> dict:
    output = {
        "val": value,
        "end": end,
        "form": form,
        "filed": filed,
        "accn": accession,
    }
    if start:
        output["start"] = start
    return output


def concept(
    unit: str,
    entries: list[dict],
) -> dict:
    return {"units": {unit: entries}}


def sample_companyfacts() -> dict:
    return {
        "facts": {
            "ifrs-full": {
                "Revenue": concept(
                    "CAD",
                    [
                        fact(
                            100,
                            start="2025-01-01",
                            end="2025-12-31",
                            form="40-F",
                            filed="2026-03-01",
                            accession="0000000000-26-000001",
                        ),
                        fact(
                            30,
                            start="2026-01-01",
                            end="2026-03-31",
                            form="6-K",
                            filed="2026-05-01",
                            accession="0000000000-26-000002",
                        ),
                    ],
                ),
                "ProfitLoss": concept(
                    "CAD",
                    [
                        fact(
                            12,
                            start="2025-01-01",
                            end="2025-12-31",
                            form="40-F",
                            filed="2026-03-01",
                            accession="0000000000-26-000001",
                        ),
                        fact(
                            4,
                            start="2026-01-01",
                            end="2026-03-31",
                            form="6-K",
                            filed="2026-05-01",
                            accession="0000000000-26-000002",
                        ),
                    ],
                ),
                "CashAndCashEquivalents": concept(
                    "CAD",
                    [
                        fact(
                            20,
                            start=None,
                            end="2025-12-31",
                            form="40-F",
                            filed="2026-03-01",
                            accession="0000000000-26-000001",
                        ),
                        fact(
                            22,
                            start=None,
                            end="2026-03-31",
                            form="6-K",
                            filed="2026-05-01",
                            accession="0000000000-26-000002",
                        ),
                    ],
                ),
                "Assets": concept(
                    "CAD",
                    [
                        fact(
                            250,
                            start=None,
                            end="2025-12-31",
                            form="40-F",
                            filed="2026-03-01",
                            accession="0000000000-26-000001",
                        ),
                        fact(
                            265,
                            start=None,
                            end="2026-03-31",
                            form="6-K",
                            filed="2026-05-01",
                            accession="0000000000-26-000002",
                        ),
                    ],
                ),
                "BorrowingsCurrent": concept(
                    "CAD",
                    [
                        fact(
                            5,
                            start=None,
                            end="2026-03-31",
                            form="6-K",
                            filed="2026-05-01",
                            accession="0000000000-26-000002",
                        )
                    ],
                ),
                "BorrowingsNoncurrent": concept(
                    "CAD",
                    [
                        fact(
                            40,
                            start=None,
                            end="2026-03-31",
                            form="6-K",
                            filed="2026-05-01",
                            accession="0000000000-26-000002",
                        )
                    ],
                ),
            }
        }
    }


def test_edgar_builds_annual_and_quarterly_periods() -> None:
    provider = SECEdgarFinancialsProvider()
    payload = sample_companyfacts()

    annual = provider._periods(
        payload,
        "0000000000",
        "annual",
    )
    quarterly = provider._periods(
        payload,
        "0000000000",
        "quarterly",
    )

    assert annual[0].total_revenue == 100
    assert annual[0].total_cash == 20
    assert annual[0].source is not None
    assert annual[0].source.source_type == "sec_edgar_xbrl"

    assert quarterly[0].total_revenue == 30
    assert quarterly[0].total_cash == 22
    assert quarterly[0].total_debt == 45
    assert quarterly[0].net_debt == 23
