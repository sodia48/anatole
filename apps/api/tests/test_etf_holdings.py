from __future__ import annotations

import pandas as pd

from app.services.etf_holdings import (
    extract_quote_changes,
    parse_top_holdings,
)


def test_top_holdings_weights_are_converted_to_percent() -> None:
    frame = pd.DataFrame(
        {
            "Name": [
                "Royal Bank of Canada",
                "Toronto-Dominion Bank",
            ],
            "Holding Percent": [
                0.081,
                0.064,
            ],
        },
        index=[
            "RY.TO",
            "TD.TO",
        ],
    )

    rows = parse_top_holdings(
        frame,
        limit=10,
    )

    assert rows[0]["display_symbol"] == "RY"
    assert rows[0]["weight_percent"] == 8.1
    assert rows[1]["weight_percent"] == 6.4


def test_live_contribution_inputs_are_extracted() -> None:
    dates = pd.to_datetime(
        [
            "2026-07-20",
            "2026-07-21",
        ]
    )
    columns = pd.MultiIndex.from_product(
        [
            ["RY.TO", "TD.TO"],
            ["Close"],
        ]
    )
    history = pd.DataFrame(
        [
            [100.0, 80.0],
            [102.0, 79.2],
        ],
        index=dates,
        columns=columns,
    )

    changes = extract_quote_changes(
        history,
        ["RY.TO", "TD.TO"],
    )

    assert round(
        float(
            changes["RY.TO"][
                "change_percent"
            ]
        ),
        2,
    ) == 2.0
    assert round(
        float(
            changes["TD.TO"][
                "change_percent"
            ]
        ),
        2,
    ) == -1.0
