from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal as D, localcontext
from random import Random

import pytest
import httpx

from app.main import app
from app.services.options_payoff import BreakEven, OptionLeg, UnderlyingLeg, break_evens, payoff, payoff_bounds, theoretical_debit


def leg(side="call", direction="long", strike="105", premium="2", **overrides):
    base = OptionLeg(symbol="TEST", market="equity", underlying="TEST-UNDERLYING", currency="USD", expiry=datetime(2027, 11, 25, 21, tzinfo=UTC),
                     side=side, direction=direction, strike=D(strike), premium=D(premium),
                     quantity=1, multiplier=D(100), price_source="manual fixture", premium_style="upfront")
    return replace(base, **overrides)


def test_single_long_and_short_call_values_and_unbounded_limits():
    long = leg()
    short = replace(long, direction="short")
    # CME's published example: 105 strike, 2 premium, settlement 112.
    assert payoff([long], D("112")) == D("500")
    assert payoff([short], D("112")) == D("-500")
    assert theoretical_debit([long]) == D(200)
    assert theoretical_debit([short]) == D(-200)
    long_bounds = payoff_bounds([long], domain_min=D(0), domain_max=None)
    short_bounds = payoff_bounds([short], domain_min=D(0), domain_max=None)
    assert (long_bounds.minimum, long_bounds.maximum) == (D("-200"), None)
    assert (short_bounds.minimum, short_bounds.maximum) == (None, D("200"))


def test_puts_and_negative_future_price_domain_do_not_assume_zero_floor():
    put = leg("put", "long", "10", "2", market="futures")
    assert payoff([put], D("-5")) == D("1300")
    bounds = payoff_bounds([put], domain_min=None, domain_max=None)
    assert (bounds.minimum, bounds.maximum) == (D("-200"), None)
    assert bounds.upper_unbounded and not bounds.lower_unbounded


def test_bull_call_spread_and_covered_call():
    spread = [leg(strike="100", premium="4"), leg(direction="short", strike="110", premium="1")]
    assert payoff(spread, D("95")) == D("-300")
    assert payoff(spread, D("105")) == D("200")
    assert payoff(spread, D("115")) == D("700")
    bounds = payoff_bounds(spread, domain_min=D(0), domain_max=None)
    assert (bounds.minimum, bounds.maximum) == (D("-300"), D("700"))
    shares = UnderlyingLeg("equity", "TEST-UNDERLYING", "USD", D(100), D(100), "manual fixture")
    covered = payoff_bounds([leg(direction="short")], domain_min=D(0), domain_max=None, underlying=shares)
    assert (covered.minimum, covered.maximum) == (D("-9800"), D("700"))
    assert theoretical_debit([leg(direction="short")], shares) == D(9800)


def test_futures_position_does_not_treat_notional_as_cash_debit():
    future = UnderlyingLeg("futures", "TEST-UNDERLYING", "USD", D(100), D(100), "manual fixture")
    assert theoretical_debit([leg(market="futures")], future) is None


def test_iron_condor_has_a_bounded_credit_and_loss():
    condor = [leg("put", "long", "90", "1"), leg("put", "short", "95", "2"),
              leg("call", "short", "105", "2"), leg("call", "long", "110", "1")]
    assert payoff(condor, D(100)) == D(200)
    assert payoff(condor, D(80)) == payoff(condor, D(120)) == D(-300)
    bounds = payoff_bounds(condor, domain_min=D(0), domain_max=None)
    assert (bounds.minimum, bounds.maximum) == (D(-300), D(200))
    assert break_evens(condor, domain_min=D(0), domain_max=None) == [BreakEven(D(93), D(93)), BreakEven(D(107), D(107))]


def test_break_even_points_and_zero_intervals_are_not_confused():
    assert break_evens([leg()], domain_min=D(0), domain_max=None) == [BreakEven(D(107), D(107))]
    straddle = [leg("call", "long", "100", "3"), leg("put", "long", "100", "2")]
    assert break_evens(straddle, domain_min=D(0), domain_max=None) == [BreakEven(D(95), D(95)), BreakEven(D(105), D(105))]
    offset = [leg(), leg(direction="short")]
    assert break_evens(offset, domain_min=D(0), domain_max=None) == [BreakEven(D(0), None)]
    futures_offset = [replace(item, market="futures") for item in offset]
    assert break_evens(futures_offset, domain_min=None, domain_max=None) == [BreakEven(None, None)]
    assert break_evens([leg()], domain_min=D(0), domain_max=D(106)) == []


def test_unbounded_straddle_tails_are_classified_in_both_directions():
    long = [leg("call", "long", "0", "3", market="futures"), leg("put", "long", "0", "2", market="futures")]
    short = [replace(item, direction="short") for item in long]
    long_bounds = payoff_bounds(long, domain_min=None, domain_max=None)
    short_bounds = payoff_bounds(short, domain_min=None, domain_max=None)
    assert (long_bounds.minimum, long_bounds.maximum) == (D(-500), None)
    assert (short_bounds.minimum, short_bounds.maximum) == (None, D(500))
    assert break_evens(long, domain_min=None, domain_max=None) == [BreakEven(D(-5), D(-5)), BreakEven(D(5), D(5))]


@pytest.mark.parametrize("change", [
    {"expiry": datetime(2027, 11, 25, 20, tzinfo=UTC)}, {"expiry": datetime(2027, 11, 25, 21)}, {"currency": "CAD"}, {"underlying": "OTHER"},
    {"market": "futures"},
    {"premium_style": "futures_style"}, {"premium": D("-1")}, {"multiplier": D(0)},
    {"quantity": 0}, {"quantity": True}, {"strike": D("NaN")}, {"price_source": ""},
])
def test_invalid_or_incompatible_legs_are_rejected(change):
    with pytest.raises(ValueError):
        payoff([leg(), replace(leg(), **change)], D(100))


def test_invalid_domain_is_rejected():
    with pytest.raises(ValueError):
        payoff_bounds([leg()], domain_min=D(20), domain_max=D(10))
    with pytest.raises(ValueError):
        payoff([leg()], D("Infinity"))
    with pytest.raises(ValueError):
        payoff([leg()], D(-1))
    with pytest.raises(ValueError):
        payoff_bounds([leg()], domain_min=None, domain_max=None)


def test_large_decimal_payoff_is_not_silently_rounded():
    item = leg(strike="999999999999.123456", premium="0.123456", multiplier=D("99999999.999999"), quantity=10000)
    with localcontext() as ctx:
        ctx.prec = 80
        expected = (D("123456789012.123456") - D("0.123456")) * D("99999999.999999") * 10000
    assert payoff([item], D("1123456789011.246912")) == expected


def test_extrema_match_independent_integer_grid_for_bounded_domains():
    random = Random(4807)
    for _ in range(50):
        legs = [leg(side=random.choice(["call", "put"]), direction=random.choice(["long", "short"]),
                    strike=str(random.randrange(0, 201)), premium=str(random.randrange(0, 20)),
                    quantity=random.randrange(1, 4)) for _ in range(random.randrange(1, 5))]
        values = [payoff(legs, D(price)) for price in range(201)]
        bounds = payoff_bounds(legs, domain_min=D(0), domain_max=D(200))
        assert bounds.minimum == min(values)
        assert bounds.maximum == max(values)


@pytest.mark.asyncio
async def test_http_payoff_uses_explicit_legs_and_rejects_mixed_expiries():
    long_call = {"symbol": "SYNTHETIC-CALL", "market": "equity", "underlying": "FIXTURE",
                 "currency": "USD", "expiry": "2027-11-25T21:00:00Z", "side": "call", "direction": "long",
                 "strike": "105", "premium": "2", "quantity": 1, "multiplier": "100",
                 "price_source": "manual fixture", "premium_style": "upfront"}
    payload = {"legs": [long_call], "domain_min": "0", "domain_max": None, "prices": ["100", "112"]}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/options/strategy/payoff", json=payload)
        different_expiry = {**long_call, "expiry": "2027-11-25T20:00:00Z"}
        mixed = await client.post("/api/v1/options/strategy/payoff", json={**payload, "legs": [long_call, different_expiry]})
        futures_style = await client.post("/api/v1/options/strategy/payoff", json={**payload, "legs": [{**long_call, "premium_style": "futures_style"}]})
        outside_domain = await client.post("/api/v1/options/strategy/payoff", json={**payload, "prices": ["-1"]})
        bad_quantity = await client.post("/api/v1/options/strategy/payoff", json={**payload, "legs": [{**long_call, "quantity": True}]})
        future_put = {**long_call, "market": "futures", "side": "put", "strike": "10"}
        negative_future = await client.post("/api/v1/options/strategy/payoff", json={**payload, "legs": [future_put], "domain_min": None, "prices": ["-5"]})
    assert response.status_code == 200
    body = response.json()
    assert [D(point["profit_loss"]) for point in body["points"]] == [D(-200), D(500)]
    assert D(body["theoretical_debit"]) == D(200)
    assert body["gain_unbounded"] and not body["loss_unbounded"]
    assert D(body["break_evens"][0]["lower"]) == D(107)
    assert mixed.status_code == futures_style.status_code == outside_domain.status_code == 400
    assert bad_quantity.status_code == 422
    assert negative_future.status_code == 200 and D(negative_future.json()["points"][0]["profit_loss"]) == D(1300)
