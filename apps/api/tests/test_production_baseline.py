from __future__ import annotations

from app.core.production_baseline import summarize_production_samples


def _sample(
    *,
    ts: float,
    uptime: float,
    api_p95: float,
    route_p95: float,
    provider_p95: float,
    route_ok: bool = True,
    provider_ok: bool = True,
) -> dict:
    return {
        "captured_ts": ts,
        "uptime_seconds": uptime,
        "api_p95_ms": api_p95,
        "error_rate_5xx": 0.25,
        "route_metrics": [
            {
                "path": "/api/v1/market/cockpit",
                "requests": 20,
                "p95_duration_ms": route_p95,
                "within_budget": route_ok,
            }
        ],
        "performance": {
            "cache": {
                "memory_hit_rate_percent": 80.0,
                "redis_hit_rate_percent": 70.0,
                "redis_errors": 0,
            },
            "latency": [
                {
                    "kind": "upstream",
                    "name": "query1.finance.yahoo.com",
                    "p95_ms": provider_p95,
                    "within_budget": provider_ok,
                }
            ],
        },
    }


def test_summary_detects_restart_and_aggregates_p95() -> None:
    samples = [
        _sample(
            ts=1_000.0,
            uptime=5_000.0,
            api_p95=400.0,
            route_p95=500.0,
            provider_p95=700.0,
        ),
        _sample(
            ts=1_300.0,
            uptime=5_300.0,
            api_p95=600.0,
            route_p95=900.0,
            provider_p95=1_500.0,
            route_ok=False,
            provider_ok=False,
        ),
        _sample(
            ts=1_600.0,
            uptime=120.0,
            api_p95=500.0,
            route_p95=700.0,
            provider_p95=1_100.0,
        ),
    ]

    summary = summarize_production_samples(
        samples,
        requested_hours=48,
    )

    assert summary["sample_count"] == 3
    assert summary["process_restarts_detected"] == 1
    assert summary["api"]["p95_median_ms"] == 500.0
    assert summary["api"]["p95_peak_ms"] == 600.0
    assert summary["slowest_routes"][0]["p95_median_ms"] == 700.0
    assert summary["slowest_routes"][0]["p95_peak_ms"] == 900.0
    assert summary["slowest_upstreams"][0]["p95_median_ms"] == 1_100.0
    assert summary["recurring_budget_violations"]


def test_empty_summary_is_explicitly_insufficient() -> None:
    summary = summarize_production_samples(
        [],
        requested_hours=48,
    )

    assert summary["enabled"] is True
    assert summary["available"] is True
    assert summary["sample_count"] == 0
    assert summary["sufficient"] is False
    assert summary["slowest_routes"] == []
