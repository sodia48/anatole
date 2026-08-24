from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.accounts import SyncedWorkspaceData


def layout(index: int, *, drawings: int = 0, indicators: int = 0) -> dict:
    return {
        "id": f"layout-{index}",
        "name": f"Focus {index}",
        "ticker": "ry.to",
        "chart_type": "candles",
        "timeframe": "1D",
        "drawings": [
            {
                "id": f"drawing-{item}",
                "tool": "trendline",
                "anchors": [{"time": 1, "price": 100}, {"time": 2, "price": 101}],
                "color": "#2c9cff",
                "line_width": 2,
                "locked": False,
                "hidden": False,
                "fib_levels": [],
            }
            for item in range(drawings)
        ],
        "indicators": [
            {
                "id": f"indicator-{item}",
                "definition_id": "sma",
                "inputs": {"period": item + 2},
                "colors": ["#2c9cff"],
                "line_width": 2,
                "visible": True,
            }
            for item in range(indicators)
        ],
    }


def test_old_workspace_payload_remains_backward_compatible() -> None:
    workspace = SyncedWorkspaceData.model_validate({
        "watchlist": ["ry.to"],
        "portfolio": [],
        "alerts": [],
    })
    assert workspace.watchlist == ["RY"]
    assert workspace.focus_layouts == []
    assert workspace.focus_scripts == []


def test_focus_layouts_are_normalized_and_deduplicated() -> None:
    workspace = SyncedWorkspaceData.model_validate({
        "focus_layouts": [layout(1), layout(1)],
        "focus_scripts": [
            {"id": "script-1", "name": "Safe", "source": 'indicator "safe"\nplot(close)'},
            {"id": "script-1", "name": "Duplicate", "source": 'indicator "duplicate"\nplot(close)'},
        ],
    })
    assert len(workspace.focus_layouts) == 1
    assert workspace.focus_layouts[0].ticker == "RY"
    assert len(workspace.focus_scripts) == 1


@pytest.mark.parametrize("payload", [
    {"focus_layouts": [layout(index) for index in range(11)]},
    {"focus_layouts": [layout(1, drawings=51)]},
    {"focus_layouts": [layout(1, indicators=21)]},
])
def test_focus_workspace_enforces_professional_limits(payload: dict) -> None:
    with pytest.raises(ValidationError):
        SyncedWorkspaceData.model_validate(payload)


def test_focus_workspace_rejects_payload_above_500_kb() -> None:
    with pytest.raises(ValidationError):
        SyncedWorkspaceData.model_validate({
            "focus_scripts": [
                {
                    "id": f"script-{index}",
                    "name": f"Script {index}",
                    "source": "x" * 8_000,
                }
                for index in range(10)
            ],
            "alerts": [
                {
                    "id": f"alert-{index}",
                    "symbol": "RY",
                    "metric": "price",
                    "operator": "above",
                    "threshold": 100,
                    "label": "x" * 10_000,
                }
                for index in range(50)
            ],
        })
