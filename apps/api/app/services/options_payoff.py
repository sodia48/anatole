"""Deterministic, single-expiry vanilla option payoffs.

No prices or contract specifications are inferred. This module does not model
early exercise, margining, fees, taxes, FX, settlement or pre-expiry value.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, localcontext
from functools import wraps
from typing import Literal


@dataclass(frozen=True)
class OptionLeg:
    symbol: str
    market: Literal["equity", "futures"]
    underlying: str
    currency: str
    expiry: datetime
    side: Literal["call", "put"]
    direction: Literal["long", "short"]
    strike: Decimal
    premium: Decimal
    quantity: int
    multiplier: Decimal
    price_source: str
    # Equity-style premium is paid up front. Futures-style margining is not
    # interchangeable and must be handled by a different model.
    premium_style: Literal["upfront", "futures_style"]


@dataclass(frozen=True)
class UnderlyingLeg:
    market: Literal["equity", "futures"]
    underlying: str
    currency: str
    units: Decimal  # positive long, negative short
    entry_price: Decimal
    price_source: str


@dataclass(frozen=True)
class PayoffBounds:
    minimum: Decimal | None  # None means unbounded below
    maximum: Decimal | None  # None means unbounded above
    lower_unbounded: bool
    upper_unbounded: bool


@dataclass(frozen=True)
class BreakEven:
    lower: Decimal | None  # None denotes an unbounded end of a zero-payoff interval.
    upper: Decimal | None


def _finite(value: Decimal) -> bool:
    return isinstance(value, Decimal) and value.is_finite()


def _financial_precision(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        # Input limits in the API fit well within this precision even after
        # multiplication by contract quantity and summing multiple legs.
        with localcontext() as context:
            context.prec = 60
            return function(*args, **kwargs)
    return wrapped


def validate_legs(options: list[OptionLeg], underlying: UnderlyingLeg | None = None) -> None:
    if not options:
        raise ValueError("at least one option leg is required")
    first = options[0]
    for leg in options:
        if not leg.symbol.strip() or not leg.underlying.strip() or not leg.price_source.strip():
            raise ValueError("contract identity and price source are required")
        if leg.market not in ("equity", "futures") or leg.market != first.market:
            raise ValueError("all legs must use the same supported market")
        if leg.currency != first.currency or leg.underlying != first.underlying:
            raise ValueError("all legs must use the same underlying and currency")
        if not isinstance(leg.expiry, datetime) or leg.expiry.utcoffset() is None or leg.expiry != first.expiry:
            raise ValueError("mixed or missing expiries require another model")
        if leg.side not in ("call", "put") or leg.direction not in ("long", "short"):
            raise ValueError("invalid option side or direction")
        if leg.premium_style != "upfront":
            raise ValueError("futures-style margining is not supported")
        if not all(_finite(value) for value in (leg.strike, leg.premium, leg.multiplier)):
            raise ValueError("finite decimal inputs are required")
        if leg.premium < 0 or leg.multiplier <= 0 or type(leg.quantity) is not int or leg.quantity <= 0:
            raise ValueError("premium, quantity or multiplier is invalid")
        if leg.market == "equity" and leg.strike < 0:
            raise ValueError("equity strike cannot be negative")
    if len(first.currency) != 3 or not first.currency.isascii() or not first.currency.isalpha() or first.currency != first.currency.upper():
        raise ValueError("currency must be an uppercase three-letter code")
    if underlying:
        if underlying.market != first.market or underlying.underlying != first.underlying or underlying.currency != first.currency:
            raise ValueError("underlying position must match all option legs")
        if not underlying.price_source.strip() or not _finite(underlying.units) or not _finite(underlying.entry_price):
            raise ValueError("underlying position inputs are invalid")
        if underlying.market == "equity" and underlying.entry_price < 0:
            raise ValueError("equity entry price cannot be negative")


@_financial_precision
def payoff(options: list[OptionLeg], spot: Decimal, underlying: UnderlyingLeg | None = None) -> Decimal:
    validate_legs(options, underlying)
    if not _finite(spot):
        raise ValueError("a finite underlying price is required")
    if options[0].market == "equity" and spot < 0:
        raise ValueError("equity prices cannot be negative")
    result = Decimal(0)
    if underlying:
        result += underlying.units * (spot - underlying.entry_price)
    for leg in options:
        intrinsic = max(spot - leg.strike, Decimal(0)) if leg.side == "call" else max(leg.strike - spot, Decimal(0))
        direction = 1 if leg.direction == "long" else -1
        result += direction * leg.quantity * leg.multiplier * (intrinsic - leg.premium)
    return result


@_financial_precision
def theoretical_debit(options: list[OptionLeg], underlying: UnderlyingLeg | None = None) -> Decimal | None:
    """Signed upfront cash flow, excluding costs and collateral; None if unknown."""
    validate_legs(options, underlying)
    if underlying and underlying.market == "futures":
        # Futures do not require the notional to be paid; margin is unknown.
        return None
    debit = sum((leg.quantity * leg.multiplier * leg.premium * (1 if leg.direction == "long" else -1)
                 for leg in options), Decimal(0))
    return debit + (underlying.units * underlying.entry_price if underlying else Decimal(0))


def _domain_points(options: list[OptionLeg], domain_min: Decimal | None, domain_max: Decimal | None) -> list[Decimal]:
    if (domain_min is not None and not _finite(domain_min)) or (domain_max is not None and not _finite(domain_max)):
        raise ValueError("domain bounds must be finite or None")
    if domain_min is not None and domain_max is not None and domain_min > domain_max:
        raise ValueError("invalid price domain")
    if options[0].market == "equity" and (domain_min is None or domain_min < 0):
        raise ValueError("equity price domain must have a nonnegative lower bound")
    points = {leg.strike for leg in options if (domain_min is None or leg.strike >= domain_min)
              and (domain_max is None or leg.strike <= domain_max)}
    if domain_min is not None:
        points.add(domain_min)
    if domain_max is not None:
        points.add(domain_max)
    if not points:
        raise ValueError("no payoff points in domain")
    return sorted(points)


def _tail_slopes(options: list[OptionLeg], underlying: UnderlyingLeg | None) -> tuple[Decimal, Decimal]:
    base = underlying.units if underlying else Decimal(0)
    left = base - sum((leg.quantity * leg.multiplier * (1 if leg.direction == "long" else -1)
                       for leg in options if leg.side == "put"), Decimal(0))
    right = base + sum((leg.quantity * leg.multiplier * (1 if leg.direction == "long" else -1)
                        for leg in options if leg.side == "call"), Decimal(0))
    return left, right


@_financial_precision
def payoff_bounds(options: list[OptionLeg], *, domain_min: Decimal | None,
                  domain_max: Decimal | None, underlying: UnderlyingLeg | None = None) -> PayoffBounds:
    """Exact extrema on an explicitly specified price domain, including tails."""
    validate_legs(options, underlying)
    points = _domain_points(options, domain_min, domain_max)
    values = [payoff(options, point, underlying) for point in points]
    left_slope, right_slope = _tail_slopes(options, underlying)
    below = (domain_min is None and left_slope > 0) or (domain_max is None and right_slope < 0)
    above = (domain_min is None and left_slope < 0) or (domain_max is None and right_slope > 0)
    return PayoffBounds(minimum=None if below else min(values), maximum=None if above else max(values),
                        lower_unbounded=below, upper_unbounded=above)


@_financial_precision
def break_evens(options: list[OptionLeg], *, domain_min: Decimal | None,
                domain_max: Decimal | None, underlying: UnderlyingLeg | None = None) -> list[BreakEven]:
    """Return zero-payoff points and intervals, never a fabricated unique root."""
    validate_legs(options, underlying)
    points = _domain_points(options, domain_min, domain_max)
    values = [payoff(options, point, underlying) for point in points]
    left_slope, right_slope = _tail_slopes(options, underlying)
    intervals: list[BreakEven] = [BreakEven(point, point) for point, value in zip(points, values) if value == 0]
    for left, right, low, high in zip(points, points[1:], values, values[1:]):
        if low == high == 0:
            intervals.append(BreakEven(left, right))
        elif low * high < 0:
            root = left - low * (right - left) / (high - low)
            intervals.append(BreakEven(root, root))
    if domain_min is None:
        if left_slope == 0 and values[0] == 0:
            intervals.append(BreakEven(None, points[0]))
        elif left_slope:
            root = points[0] - values[0] / left_slope
            if root <= points[0]:
                intervals.append(BreakEven(root, root))
    if domain_max is None:
        if right_slope == 0 and values[-1] == 0:
            intervals.append(BreakEven(points[-1], None))
        elif right_slope:
            root = points[-1] - values[-1] / right_slope
            if root >= points[-1]:
                intervals.append(BreakEven(root, root))
    intervals.sort(key=lambda item: (item.lower is not None, item.lower or Decimal(0)))
    merged: list[BreakEven] = []
    for interval in intervals:
        previous = merged[-1] if merged else None
        if previous and (previous.upper is None or interval.lower is None or interval.lower <= previous.upper):
            upper = None if previous.upper is None or interval.upper is None else max(previous.upper, interval.upper)
            merged[-1] = BreakEven(previous.lower, upper)
        else:
            merged.append(interval)
    return merged
