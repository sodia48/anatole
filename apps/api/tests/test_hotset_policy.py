from app.core.hotset_policy import choose_hotset_policy


def test_small_sample_window_keeps_healthy_cadence() -> None:
    policy = choose_hotset_policy(
        {"total_requests": 19, "p95_duration_ms": 9_000, "error_rate_5xx": 9},
        {"latency": [{"kind": "upstream", "p95_ms": 9_000}]},
    )

    assert policy.level == "healthy"
    assert policy.tsx60_seconds == 20.0


def test_global_p95_applies_pressure_backoff() -> None:
    policy = choose_hotset_policy(
        {"total_requests": 40, "p95_duration_ms": 1_700, "error_rate_5xx": 0},
        {"latency": []},
    )

    assert policy.level == "pressured"
    assert policy.composite_seconds > 100.0
    assert policy.discovery_seconds > 120.0


def test_upstream_budget_violation_applies_pressure_backoff() -> None:
    policy = choose_hotset_policy(
        {"total_requests": 60, "p95_duration_ms": 500, "error_rate_5xx": 0},
        {
            "latency": [
                {"kind": "redis", "p95_ms": 20},
                {"kind": "upstream", "p95_ms": 1_350},
            ]
        },
    )

    assert policy.level == "pressured"
    assert policy.tsx60_seconds == 40.0


def test_severe_errors_protect_interactive_traffic() -> None:
    policy = choose_hotset_policy(
        {"total_requests": 80, "p95_duration_ms": 700, "error_rate_5xx": 3.2},
        {"latency": []},
    )

    assert policy.level == "severe"
    assert policy.tsx60_seconds == 90.0
    assert policy.discovery_seconds == 360.0


def test_severe_upstream_latency_protects_interactive_traffic() -> None:
    policy = choose_hotset_policy(
        {"total_requests": 80, "p95_duration_ms": 600, "error_rate_5xx": 0},
        {"latency": [{"kind": "upstream", "p95_ms": 2_900}]},
    )

    assert policy.level == "severe"
