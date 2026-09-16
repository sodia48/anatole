from app.core.telemetry import PerformanceMonitor, ReliabilityMonitor


def test_performance_monitor_reports_latency_cache_and_budget_violations():
    monitor = PerformanceMonitor(max_samples=200)

    monitor.record("cache", "memory:quotes", "hit")
    monitor.record("cache", "memory:quotes", "hit")
    monitor.record("cache", "memory:quotes", "miss")
    monitor.record("redis", "quotes", "hit", duration_ms=12)
    monitor.record("redis", "quotes", "miss", duration_ms=25)
    monitor.record("singleflight", "quotes", "owner", duration_ms=8)
    monitor.record(
        "upstream",
        "query1.finance.yahoo.com",
        "http_200",
        duration_ms=250,
    )
    monitor.record(
        "upstream",
        "query1.finance.yahoo.com",
        "http_200",
        duration_ms=1600,
    )

    snapshot = monitor.snapshot()

    assert snapshot["cache"]["memory_hits"] == 2
    assert snapshot["cache"]["memory_misses"] == 1
    assert snapshot["cache"]["memory_hit_rate_percent"] == 66.67
    assert snapshot["cache"]["redis_hits"] == 1
    assert snapshot["cache"]["redis_misses"] == 1
    assert snapshot["singleflight"]["owners"] == 1

    yahoo = next(
        item
        for item in snapshot["latency"]
        if item["kind"] == "upstream"
        and item["name"] == "query1.finance.yahoo.com"
    )
    assert yahoo["samples"] == 2
    assert yahoo["p95_ms"] == 1600
    assert yahoo["within_budget"] is False
    assert snapshot["budget_violations"]


def test_reliability_monitor_reports_route_p50_p95_and_budget():
    monitor = ReliabilityMonitor()

    for index, duration in enumerate((100, 200, 300, 400)):
        monitor.record_request(
            path="/api/v1/market/quotes/RY",
            method="GET",
            status_code=200,
            duration_ms=duration,
            request_id=f"req-{index}",
        )

    monitor.record_request(
        path="/health",
        method="GET",
        status_code=200,
        duration_ms=50,
        request_id="health-1",
    )

    snapshot = monitor.snapshot()
    route = next(
        item
        for item in snapshot["route_metrics"]
        if item["path"] == "/api/v1/market/quotes/{id}"
    )
    health = next(
        item
        for item in snapshot["route_metrics"]
        if item["path"] == "/health"
    )

    assert route["requests"] == 4
    assert route["p50_duration_ms"] == 300
    assert route["p95_duration_ms"] == 400
    assert route["budget_ms"] == 1500.0
    assert route["within_budget"] is True
    assert health["budget_ms"] == 300.0
