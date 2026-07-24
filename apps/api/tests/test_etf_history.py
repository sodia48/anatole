from __future__ import annotations

import pandas as pd

from app.services.etf_history import (
    build_history_snapshot,
    normalize_history_frame,
)


def test_history_frame_is_normalized_and_sorted() -> None:
    index = pd.to_datetime(
        [
            "2026-07-22",
            "2026-07-21",
        ]
    )
    frame = pd.DataFrame(
        {
            "Open": [51.0, 50.0],
            "High": [52.0, 51.0],
            "Low": [50.5, 49.5],
            "Close": [51.5, 50.5],
            "Volume": [1200, 1000],
        },
        index=index,
    )

    points = normalize_history_frame(frame)

    assert len(points) == 2
    assert points[0].close == 50.5
    assert points[1].close == 51.5
    assert points[1].volume == 1200


def test_history_performance_is_calculated() -> None:
    index = pd.to_datetime(
        [
            "2026-01-02",
            "2026-07-22",
        ]
    )
    frame = pd.DataFrame(
        {
            "Open": [100.0, 109.0],
            "High": [102.0, 112.0],
            "Low": [99.0, 108.0],
            "Close": [100.0, 110.0],
            "Volume": [1000, 1500],
        },
        index=index,
    )
    points = normalize_history_frame(frame)
    snapshot = build_history_snapshot(
        ticker="XIU",
        normalized_symbol="XIU.TO",
        selected_range="ytd",
        points=points,
    )

    assert snapshot.status == "available"
    assert snapshot.change == 10.0
    assert snapshot.change_percent == 10.0
    assert snapshot.period_high == 112.0
    assert snapshot.period_low == 99.0
