import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.core.config import settings
from app.jobs import commodity_options_ingest as ingestion
from app.main import app
from app.schemas.options import OptionChainSnapshot
from app.services import options as options_module
from app.services.commodity_option_snapshots import CommodityOptionSnapshots


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.fail_reads = False

    async def get(self, key):
        if self.fail_reads:
            raise ConnectionError("simulated outage")
        return self.values.get(key)

    async def set(self, key, value, *, nx=False, ex=None):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def eval(self, script, numkeys, *args):
        if numkeys == 1:
            key, token = args
            if self.values.get(key) == token:
                del self.values[key]
                return 1
            return 0
        lock, key, token, value = args
        if self.values.get(lock) != token:
            return 0
        self.values[key] = value
        return 1


def payload(root="RB"):
    # Synthetic values, used only to test transport and normalization.
    return {"status": {"code": 200}, "results": [
        {"symbol": f"{root}-C", "root": root, "contract": f"{root}Z27",
         "type": "Call", "strike": 2.5, "expirationDate": "2027-11-25",
         "last": 0, "lastPrice": 1.5, "volume": 0, "openInterest": 42,
         "exchange": "TEST", "date": "2027-10-01"},
        {"symbol": f"{root}-P", "root": root, "contract": f"{root}Z27",
         "type": "Put", "strike": 2.5, "expirationDate": "2027-11-25",
         "last": 0.2, "volume": None, "openInterest": None, "exchange": "TEST"},
    ]}


def store():
    return CommodityOptionSnapshots(url="redis://test", prefix="test", client=FakeRedis())


@pytest.fixture
def authorized(monkeypatch):
    monkeypatch.setattr(settings, "commodity_options_barchart_authorized", True)
    monkeypatch.setattr(settings, "barchart_api_key", "fixture-only")


def test_normalization_keeps_zero_missing_and_real_expiry_separate():
    data = payload()
    data["results"][0]["impliedVolatility"] = 0.25
    snapshot = ingestion.normalize("RB", data)
    call, put = snapshot.contracts
    assert call.expiration == "2027-11-25" and call.contract == "RBZ27"
    assert call.last == 0 and call.volume == 0 and call.open_interest == 42
    assert put.volume is None and put.open_interest is None
    assert snapshot.analytics.put_volume is None
    assert snapshot.analytics.put_call_volume_ratio is None
    assert snapshot.analytics.atm_implied_volatility is None
    assert call.implied_volatility is None
    assert snapshot.source_statuses[0].status == "partial"


def test_expired_contracts_are_not_listed_and_caps_are_disclosed(monkeypatch):
    expired = payload()
    for row in expired["results"]:
        row["expirationDate"] = "2020-01-02"
    with pytest.raises(ValueError, match="no validated contracts"):
        ingestion.normalize("RB", expired)
    monkeypatch.setattr(ingestion, "MAX_ROWS", 1)
    capped = ingestion.normalize("RB", payload())
    assert len(capped.contracts) == 1
    assert "limitée" in capped.source_statuses[0].detail


@pytest.mark.asyncio
async def test_no_authorization_never_contacts_provider(monkeypatch):
    monkeypatch.setattr(settings, "commodity_options_barchart_authorized", False)
    fetch = AsyncMock(side_effect=AssertionError("must not fetch"))
    monkeypatch.setattr(ingestion, "fetch_barchart", fetch)
    with pytest.raises(RuntimeError, match="verified rights"):
        await ingestion.ingest(("RB",), store=store())
    response = await options_module.OptionsService().chain(market="commodities", symbol="RB")
    assert not response.contracts and response.source_statuses[0].status == "unavailable"
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_ingestion_preserves_last_good_on_provider_failure(monkeypatch, authorized):
    cache = store()
    monkeypatch.setattr(ingestion, "fetch_barchart", AsyncMock(return_value=payload()))
    assert await ingestion.ingest(("RB",), store=cache) == {"RB": "updated"}
    original, state = await cache.read("RB")
    assert state == "hit" and original is not None
    monkeypatch.setattr(ingestion, "fetch_barchart", AsyncMock(side_effect=TimeoutError()))
    assert await ingestion.ingest(("RB",), store=cache) == {"RB": "failed"}
    assert (await cache.read("RB"))[0] == original


@pytest.mark.asyncio
async def test_concurrent_workers_are_single_flight(monkeypatch, authorized):
    cache = store()
    entered, finish = asyncio.Event(), asyncio.Event()
    fetch = AsyncMock()

    async def delayed(root):
        entered.set()
        await finish.wait()
        return payload(root)

    fetch.side_effect = delayed
    monkeypatch.setattr(ingestion, "fetch_barchart", fetch)
    owner = asyncio.create_task(ingestion.ingest(("RB",), store=cache))
    await entered.wait()
    assert await ingestion.ingest(("RB",), store=cache) == {"RB": "already_running"}
    finish.set()
    assert await owner == {"RB": "updated"}
    assert fetch.await_count == 1


@pytest.mark.asyncio
async def test_expired_lease_cannot_replace_a_newer_snapshot():
    cache = store()
    first = await cache.acquire()
    await cache.release(first)
    second = await cache.acquire()
    await cache.write("RB", ingestion.normalize("RB", payload()), token=second)
    with pytest.raises(RuntimeError, match="lease expired"):
        await cache.write("RB", ingestion.normalize("RB", payload()), token=first)


@pytest.mark.asyncio
async def test_endpoint_filters_snapshot_without_provider_calls(monkeypatch, authorized):
    cache = store()
    token = await cache.acquire()
    snapshot = ingestion.normalize("RB", payload())
    snapshot.generated_at = datetime.now(UTC) - timedelta(days=2)
    await cache.write("RB", snapshot, token=token)
    await cache.release(token)
    monkeypatch.setattr(options_module, "commodity_option_snapshots", cache)
    fetch = AsyncMock(side_effect=AssertionError("request must not fetch"))
    monkeypatch.setattr(ingestion, "fetch_barchart", fetch)
    network = AsyncMock(side_effect=AssertionError("request must not contact providers"))
    monkeypatch.setattr(options_module.shared_http_client, "request", network)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/options/chain", params={
            "market": "commodities", "symbol": "RB", "expiration": "2027-11-25"})
        other = await client.get("/api/v1/options/chain", params={
            "market": "commodities", "symbol": "RB", "expiration": "2027-12-25"})
    assert response.status_code == 200 and len(response.json()["contracts"]) == 2
    assert response.json()["stale"] is True
    assert other.status_code == 200 and other.json()["contracts"] == []
    fetch.assert_not_awaited()
    network.assert_not_awaited()
    cache._client.fail_reads = True
    fallback = await options_module.OptionsService().chain(market="commodities", symbol="RB")
    assert fallback.stale and len(fallback.contracts) == 2


@pytest.mark.asyncio
async def test_invalid_requested_expiry_returns_400():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/options/chain", params={
            "market": "commodities", "symbol": "RB", "expiration": "2027-02-31"})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_evicted_snapshot_uses_local_last_good_as_stale(authorized):
    cache = store()
    token = await cache.acquire()
    await cache.write("RB", ingestion.normalize("RB", payload()), token=token)
    await cache.release(token)
    assert (await cache.read("RB"))[1] == "hit"
    cache._client.values.pop(cache._key("RB"))
    saved, state = await cache.read("RB")
    assert saved is not None and state == "local_stale"


@pytest.mark.asyncio
async def test_recent_collection_does_not_make_old_provider_data_fresh(monkeypatch, authorized):
    cache = store()
    old_payload = payload()
    old_payload["results"][0]["date"] = "2020-01-02"
    token = await cache.acquire()
    await cache.write("RB", ingestion.normalize("RB", old_payload), token=token)
    await cache.release(token)
    monkeypatch.setattr(options_module, "commodity_option_snapshots", cache)
    result = await options_module.OptionsService().chain(market="commodities", symbol="RB")
    assert result.source_observation_date == "2020-01-02"
    assert result.stale is True


@pytest.mark.asyncio
async def test_invalid_or_empty_response_does_not_replace_snapshot(monkeypatch, authorized):
    cache = store()
    token = await cache.acquire()
    snapshot = ingestion.normalize("RB", payload())
    await cache.write("RB", snapshot, token=token)
    await cache.release(token)
    bad = {"status": {"code": 200}, "results": [{"symbol": "X", "root": "RB", "type": "Call", "strike": 3, "expirationDate": "2027-02-31"}]}
    monkeypatch.setattr(ingestion, "fetch_barchart", AsyncMock(return_value=bad))
    assert await ingestion.ingest(("RB",), store=cache) == {"RB": "failed"}
    restored, _ = await cache.read("RB")
    assert restored == snapshot


@pytest.mark.asyncio
async def test_coverage_drop_does_not_overwrite_last_good(monkeypatch, authorized):
    cache = store()
    token = await cache.acquire()
    original = ingestion.normalize("RB", payload())
    original.contracts = [item.model_copy(update={"symbol": f"synthetic-{i}"})
                          for i, item in enumerate(original.contracts * 25)]
    await cache.write("RB", original, token=token)
    await cache.release(token)
    monkeypatch.setattr(ingestion, "fetch_barchart", AsyncMock(return_value=payload()))
    assert await ingestion.ingest(("RB",), store=cache) == {"RB": "failed"}
    restored, _ = await cache.read("RB")
    assert len(restored.contracts) == 50


@pytest.mark.asyncio
async def test_provider_key_is_in_post_body_not_url(monkeypatch, authorized):
    response = httpx.Response(200, json=payload(), request=httpx.Request("POST", "https://example.invalid"))
    request = AsyncMock(return_value=response)
    monkeypatch.setattr(ingestion.shared_http_client, "request", request)
    assert await ingestion.fetch_barchart("RB") == payload()
    args, kwargs = request.await_args
    assert args[0] == "POST" and "fixture-only" not in args[1]
    assert kwargs["data"]["apikey"] == "fixture-only" and not kwargs.get("params")
