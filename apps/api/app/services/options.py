from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from html import unescape
from html.parser import HTMLParser
from statistics import median
from typing import Any

from app.core.config import settings
from app.core.data_hub import shared_data_hub
from app.core.resilience import shared_http_client
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.public_commodity_options import public_commodity_options_service
from app.schemas.options import (
    OptionAnalytics,
    OptionChainSnapshot,
    OptionContract,
    OptionSourceStatus,
    OptionUniverseItem,
    OptionUniverseSnapshot,
)

_MX_OPTIONS_URL = "https://www.m-x.ca/en/trading/data/options-list"
_MX_QUOTES_URL = "https://www.m-x.ca/en/trading/data/quotes"
_BARCHART_BASE = "https://ondemand.websol.barchart.com"
_YAHOO_OPTIONS_BASE = "https://query2.finance.yahoo.com/v7/finance/options"

_COMMODITIES: tuple[tuple[str, str, str, str], ...] = (
    ("CL", "WTI Crude Oil", "Energy", "NYMEX"),
    ("BZ", "Brent Crude Oil", "Energy", "NYMEX"),
    ("NG", "Henry Hub Natural Gas", "Energy", "NYMEX"),
    ("RB", "RBOB Gasoline", "Energy", "NYMEX"),
    ("HO", "ULSD Heating Oil", "Energy", "NYMEX"),
    ("GC", "Gold", "Metals", "COMEX"),
    ("SI", "Silver", "Metals", "COMEX"),
    ("HG", "Copper", "Metals", "COMEX"),
    ("PL", "Platinum", "Metals", "NYMEX"),
    ("PA", "Palladium", "Metals", "NYMEX"),
    ("ZC", "Corn", "Grains", "CBOT"),
    ("ZW", "Chicago SRW Wheat", "Grains", "CBOT"),
    ("KE", "KC HRW Wheat", "Grains", "CBOT"),
    ("ZO", "Oats", "Grains", "CBOT"),
    ("ZR", "Rough Rice", "Grains", "CBOT"),
    ("ZS", "Soybeans", "Oilseeds", "CBOT"),
    ("ZM", "Soybean Meal", "Oilseeds", "CBOT"),
    ("ZL", "Soybean Oil", "Oilseeds", "CBOT"),
    ("LE", "Live Cattle", "Livestock", "CME"),
    ("GF", "Feeder Cattle", "Livestock", "CME"),
    ("HE", "Lean Hogs", "Livestock", "CME"),
    ("CC", "Cocoa", "Softs", "ICEUS"),
    ("KC", "Coffee C", "Softs", "ICEUS"),
    ("SB", "Sugar No. 11", "Softs", "ICEUS"),
    ("CT", "Cotton No. 2", "Softs", "ICEUS"),
    ("OJ", "Orange Juice", "Softs", "ICEUS"),
    ("LBR", "Lumber", "Forest Products", "CME"),
    ("RS", "Canola", "Oilseeds", "WCE"),
)

_TSX_FALLBACK: tuple[tuple[str, str], ...] = (
    ("RY", "Royal Bank of Canada"),
    ("TD", "Toronto-Dominion Bank"),
    ("BNS", "Bank of Nova Scotia"),
    ("BMO", "Bank of Montreal"),
    ("CM", "Canadian Imperial Bank of Commerce"),
    ("ENB", "Enbridge"),
    ("CNQ", "Canadian Natural Resources"),
    ("SHOP", "Shopify"),
    ("XIU", "iShares S&P/TSX 60 Index ETF"),
    ("XEG", "iShares S&P/TSX Capped Energy Index ETF"),
)


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            self._row.append(_clean(" ".join(self._cell)))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if any(self._row):
                self.rows.append(self._row)
            self._row = None
            self._cell = None


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(value).replace("\xa0", " ")).strip()


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = _clean(str(value)).replace(",", "")
    if not text or text.lower() in {"n/a", "na", "null", "none", "-", "--", "—"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _integer(value: Any) -> int | None:
    number = _number(value)
    return None if number is None else int(round(number))


def _iv_percent(value: Any) -> float | None:
    number = _number(value)
    if number is None:
        return None
    return number * 100 if abs(number) <= 3 else number


def _ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def _side(value: Any) -> str | None:
    text = str(value or "").strip().lower()
    if text.startswith("c"):
        return "call"
    if text.startswith("p"):
        return "put"
    return None


def _parse_mx_date(value: str) -> str | None:
    cleaned = re.sub(r"\s*\([^)]*\)\s*$", "", _clean(value))
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def _category(name: str) -> str:
    lowered = name.lower()
    if "cdr" in lowered:
        return "CDR"
    if "etf" in lowered:
        return "ETF"
    if "index" in lowered:
        return "Index"
    if "dollar" in lowered or "currency" in lowered:
        return "Currency"
    if "fund" in lowered or "trust" in lowered:
        return "Fund / Trust"
    return "Equity"


def _parse_mx_universe(html: str) -> list[OptionUniverseItem]:
    parser = _TableParser()
    parser.feed(html)
    output: list[OptionUniverseItem] = []
    seen: set[tuple[str, str]] = set()

    for row in parser.rows:
        if len(row) < 3:
            continue
        name, option_symbol, underlying = row[:3]
        option_symbol = option_symbol.strip().upper()
        underlying = underlying.strip().upper()
        if (
            not option_symbol
            or "OPTION SYMBOL" in option_symbol
            or not re.fullmatch(r"[A-Z0-9.^-]{1,16}", option_symbol)
        ):
            continue

        if not re.fullmatch(r"[A-Z0-9.^-]{1,16}", underlying):
            underlying = option_symbol
        key = (option_symbol, underlying)
        if key in seen:
            continue
        seen.add(key)
        output.append(
            OptionUniverseItem(
                symbol=underlying,
                name=name,
                market="tsx",
                category=_category(name),
                exchange="Montréal Exchange",
                provider_symbol=option_symbol,
                source_url=_MX_OPTIONS_URL,
            )
        )

    return sorted(output, key=lambda item: (item.category, item.name, item.symbol))


def _parse_mx_chain(
    html: str,
    *,
    underlying: str,
    provider_symbol: str,
) -> tuple[list[OptionContract], list[str], float | None]:
    parser = _TableParser()
    parser.feed(html)
    contracts: list[OptionContract] = []
    expirations: set[str] = set()

    plain = _clean(re.sub(r"<[^>]+>", " ", html))
    price_match = re.search(r"Last price:\s*([0-9][0-9.,]*)", plain, re.IGNORECASE)
    underlying_price = _number(price_match.group(1)) if price_match else None

    for row in parser.rows:
        if len(row) < 14:
            continue
        expiry = _parse_mx_date(row[0])
        strike = _number(row[7])
        if expiry is None or strike is None:
            continue
        expirations.add(expiry)

        call = OptionContract(
            symbol=f"{provider_symbol}|{expiry}|{strike:g}C",
            underlying=underlying,
            market="tsx",
            side="call",
            strike=strike,
            expiration=expiry,
            exchange="Montréal Exchange",
            bid=_number(row[1]),
            ask=_number(row[2]),
            last=_number(row[3]),
            change=_number(row[4]),
            volume=_integer(row[6]),
            open_interest=_integer(row[5]),
            source="Montréal Exchange",
            delayed=True,
        )
        put = OptionContract(
            symbol=f"{provider_symbol}|{expiry}|{strike:g}P",
            underlying=underlying,
            market="tsx",
            side="put",
            strike=strike,
            expiration=expiry,
            exchange="Montréal Exchange",
            bid=_number(row[8]),
            ask=_number(row[9]),
            last=_number(row[10]),
            change=_number(row[11]),
            volume=_integer(row[13]),
            open_interest=_integer(row[12]),
            source="Montréal Exchange",
            delayed=True,
        )
        contracts.extend((call, put))

    return contracts, sorted(expirations), underlying_price


def _barchart_contract(
    item: dict[str, Any],
    *,
    market: str,
    fallback_underlying: str,
) -> OptionContract | None:
    side = _side(item.get("type"))
    strike = _number(item.get("strike"))
    expiration = str(item.get("expirationDate") or "").strip()
    if side is None or strike is None or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", expiration):
        return None

    symbol = str(
        item.get("longSymbol")
        or item.get("symbol")
        or item.get("legacySymbol")
        or f"{fallback_underlying}|{expiration}|{strike:g}{side[0].upper()}"
    )
    underlying = str(
        item.get("underlying_symbol")
        or item.get("underlyingSymbol")
        or item.get("root")
        or fallback_underlying
    ).upper()
    return OptionContract(
        symbol=symbol,
        underlying=underlying,
        market="commodities" if market == "commodities" else "tsx",
        contract=str(item.get("contract") or "").strip() or None,
        side=side,
        strike=strike,
        expiration=expiration,
        exchange=str(item.get("exchange") or "Barchart").strip(),
        bid=_number(item.get("bid")),
        ask=_number(item.get("ask")),
        last=_number(item.get("last") or item.get("lastPrice") or item.get("close")),
        change=_number(item.get("change") or item.get("netChange")),
        percent_change=_number(item.get("percentChange")),
        volume=_integer(item.get("volume")),
        open_interest=_integer(item.get("openInterest")),
        implied_volatility=_iv_percent(
            item.get("impliedVolatility")
            if item.get("impliedVolatility") is not None
            else item.get("volatility")
        ),
        delta=_number(item.get("delta")),
        gamma=_number(item.get("gamma")),
        theta=_number(item.get("theta")),
        vega=_number(item.get("vega")),
        source="Barchart OnDemand",
        delayed=True,
    )


def _yahoo_contract(
    item: dict[str, Any],
    *,
    underlying: str,
    side: str,
) -> OptionContract | None:
    strike = _number(item.get("strike"))
    expiration_epoch = _integer(item.get("expiration"))
    if strike is None or expiration_epoch is None:
        return None
    expiry = datetime.fromtimestamp(expiration_epoch, UTC).date().isoformat()
    return OptionContract(
        symbol=str(item.get("contractSymbol") or f"{underlying}|{expiry}|{strike:g}{side[0].upper()}"),
        underlying=underlying,
        market="tsx",
        side=side,  # type: ignore[arg-type]
        strike=strike,
        expiration=expiry,
        exchange="Yahoo Finance",
        bid=_number(item.get("bid")),
        ask=_number(item.get("ask")),
        last=_number(item.get("lastPrice")),
        change=_number(item.get("change")),
        percent_change=_number(item.get("percentChange")),
        volume=_integer(item.get("volume")),
        open_interest=_integer(item.get("openInterest")),
        implied_volatility=_iv_percent(item.get("impliedVolatility")),
        in_the_money=bool(item.get("inTheMoney")) if item.get("inTheMoney") is not None else None,
        source="Yahoo Finance fallback",
        delayed=True,
    )



def _normal_cdf(value: float) -> float:
    return 0.5 * (1.0 + math.erf(value / math.sqrt(2.0)))


def _normal_pdf(value: float) -> float:
    return math.exp(-0.5 * value * value) / math.sqrt(2.0 * math.pi)


def _option_mark(contract: OptionContract) -> float | None:
    bid = contract.bid
    ask = contract.ask
    if (
        bid is not None
        and ask is not None
        and bid >= 0
        and ask >= bid
        and ask > 0
    ):
        return (bid + ask) / 2.0
    if contract.last is not None and contract.last > 0:
        return contract.last
    return None


def _black_scholes_price(
    *,
    spot: float,
    strike: float,
    years: float,
    rate: float,
    sigma: float,
    side: str,
) -> float:
    root_t = math.sqrt(years)
    d1 = (
        math.log(spot / strike)
        + (rate + 0.5 * sigma * sigma) * years
    ) / (sigma * root_t)
    d2 = d1 - sigma * root_t
    discounted_strike = strike * math.exp(-rate * years)
    if side == "call":
        return spot * _normal_cdf(d1) - discounted_strike * _normal_cdf(d2)
    return discounted_strike * _normal_cdf(-d2) - spot * _normal_cdf(-d1)


def _implied_volatility(
    *,
    price: float,
    spot: float,
    strike: float,
    years: float,
    rate: float,
    side: str,
) -> float | None:
    if min(price, spot, strike, years) <= 0:
        return None

    intrinsic_floor = (
        max(0.0, spot - strike * math.exp(-rate * years))
        if side == "call"
        else max(0.0, strike * math.exp(-rate * years) - spot)
    )
    if price + 1e-8 < intrinsic_floor:
        return None

    low = 0.005
    high = 5.0
    low_price = _black_scholes_price(
        spot=spot,
        strike=strike,
        years=years,
        rate=rate,
        sigma=low,
        side=side,
    )
    high_price = _black_scholes_price(
        spot=spot,
        strike=strike,
        years=years,
        rate=rate,
        sigma=high,
        side=side,
    )
    if price < low_price - 1e-8 or price > high_price + 1e-8:
        return None

    for _ in range(72):
        mid = (low + high) / 2.0
        modeled = _black_scholes_price(
            spot=spot,
            strike=strike,
            years=years,
            rate=rate,
            sigma=mid,
            side=side,
        )
        if modeled > price:
            high = mid
        else:
            low = mid
    return (low + high) / 2.0


def _apply_black_scholes_metrics(
    contracts: list[OptionContract],
    *,
    underlying_price: float | None,
    risk_free_rate: float,
) -> int:
    if underlying_price is None or underlying_price <= 0:
        return 0

    today = datetime.now(UTC).date()
    enriched = 0

    for contract in contracts:
        try:
            expiry = datetime.strptime(contract.expiration, "%Y-%m-%d").date()
        except ValueError:
            continue

        days = (expiry - today).days
        if days < 0 or contract.strike <= 0:
            continue
        years = max((days + 0.5) / 365.0, 1.0 / 365.0)
        sigma = (
            contract.implied_volatility / 100.0
            if contract.implied_volatility is not None
            else None
        )

        if sigma is None or sigma <= 0:
            mark = _option_mark(contract)
            if mark is None:
                continue
            sigma = _implied_volatility(
                price=mark,
                spot=underlying_price,
                strike=contract.strike,
                years=years,
                rate=risk_free_rate,
                side=contract.side,
            )
            if sigma is None:
                continue
            contract.implied_volatility = round(sigma * 100.0, 4)

        root_t = math.sqrt(years)
        d1 = (
            math.log(underlying_price / contract.strike)
            + (risk_free_rate + 0.5 * sigma * sigma) * years
        ) / (sigma * root_t)
        d2 = d1 - sigma * root_t
        pdf = _normal_pdf(d1)

        if contract.delta is None:
            contract.delta = round(
                _normal_cdf(d1)
                if contract.side == "call"
                else _normal_cdf(d1) - 1.0,
                6,
            )
        if contract.gamma is None:
            contract.gamma = round(
                pdf / (underlying_price * sigma * root_t),
                8,
            )
        if contract.vega is None:
            contract.vega = round(
                underlying_price * pdf * root_t / 100.0,
                6,
            )
        if contract.theta is None:
            common = -(
                underlying_price * pdf * sigma
            ) / (2.0 * root_t)
            discounted = (
                risk_free_rate
                * contract.strike
                * math.exp(-risk_free_rate * years)
            )
            annual_theta = (
                common - discounted * _normal_cdf(d2)
                if contract.side == "call"
                else common + discounted * _normal_cdf(-d2)
            )
            contract.theta = round(annual_theta / 365.0, 6)
        if contract.in_the_money is None:
            contract.in_the_money = (
                underlying_price > contract.strike
                if contract.side == "call"
                else underlying_price < contract.strike
            )
        enriched += 1

    return enriched


def _merge_provider_metrics(
    official: list[OptionContract],
    provider: list[OptionContract],
) -> int:
    lookup = {
        (
            item.expiration,
            round(item.strike, 6),
            item.side,
        ): item
        for item in provider
    }
    enriched = 0
    for contract in official:
        match = lookup.get(
            (
                contract.expiration,
                round(contract.strike, 6),
                contract.side,
            )
        )
        if match is None:
            continue
        before = (
            contract.implied_volatility,
            contract.delta,
            contract.gamma,
            contract.theta,
            contract.vega,
        )
        for field in (
            "implied_volatility",
            "delta",
            "gamma",
            "theta",
            "vega",
            "percent_change",
        ):
            value = getattr(match, field)
            if getattr(contract, field) is None and value is not None:
                setattr(contract, field, value)
        after = (
            contract.implied_volatility,
            contract.delta,
            contract.gamma,
            contract.theta,
            contract.vega,
        )
        if after != before:
            enriched += 1
    return enriched


async def _risk_free_rate() -> tuple[float, OptionSourceStatus]:
    try:
        yields = await bank_of_canada_valet_service.yields()
        observations = yields.get("V39051") or []
        if observations:
            percent = float(observations[-1][1])
            rate = max(-0.01, min(percent / 100.0, 0.25))
            return rate, OptionSourceStatus(
                source="Banque du Canada + Anatole Analytics",
                status="available",
                detail=(
                    f"Taux 2 ans Canada {percent:.3f}% utilisé comme proxy sans risque "
                    "pour les estimations Black-Scholes."
                ),
            )
    except Exception:  # noqa: BLE001
        pass

    fallback_percent = 2.5
    return fallback_percent / 100.0, OptionSourceStatus(
        source="Anatole Analytics",
        status="partial",
        detail=(
            f"Taux de repli {fallback_percent:.2f}% utilisé pour les estimations "
            "Black-Scholes; la série Banque du Canada était indisponible."
        ),
    )



def _analytics(
    contracts: list[OptionContract],
    underlying_price: float | None,
) -> OptionAnalytics:
    calls = [item for item in contracts if item.side == "call"]
    puts = [item for item in contracts if item.side == "put"]
    call_volume = sum(item.volume or 0 for item in calls)
    put_volume = sum(item.volume or 0 for item in puts)
    call_oi = sum(item.open_interest or 0 for item in calls)
    put_oi = sum(item.open_interest or 0 for item in puts)

    iv_contracts = [item for item in contracts if item.implied_volatility is not None]
    atm_iv: float | None = None
    if iv_contracts:
        anchor = underlying_price
        if anchor is None:
            strikes = sorted({item.strike for item in iv_contracts})
            anchor = median(strikes)
        minimum_distance = min(abs(item.strike - anchor) for item in iv_contracts)
        closest = [
            item.implied_volatility
            for item in iv_contracts
            if abs(item.strike - anchor) == minimum_distance
            and item.implied_volatility is not None
        ]
        if closest:
            atm_iv = round(sum(closest) / len(closest), 4)

    max_pain: float | None = None
    strikes = sorted({item.strike for item in contracts if item.open_interest})
    if 0 < len(strikes) <= 600:
        payout: list[tuple[float, float]] = []
        for settlement in strikes:
            total = 0.0
            for item in contracts:
                oi = item.open_interest or 0
                if item.side == "call":
                    total += oi * max(0.0, settlement - item.strike)
                else:
                    total += oi * max(0.0, item.strike - settlement)
            payout.append((total, settlement))
        max_pain = min(payout)[1] if payout else None

    return OptionAnalytics(
        contract_count=len(contracts),
        call_count=len(calls),
        put_count=len(puts),
        call_volume=call_volume,
        put_volume=put_volume,
        call_open_interest=call_oi,
        put_open_interest=put_oi,
        put_call_volume_ratio=_ratio(put_volume, call_volume),
        put_call_open_interest_ratio=_ratio(put_oi, call_oi),
        atm_implied_volatility=atm_iv,
        max_pain_estimate=max_pain,
    )


class OptionsService:
    def __init__(self) -> None:
        # v3 invalide les snapshots antérieurs qui contenaient encore du
        # mojibake UTF-8 et des statuts de source dupliqués.
        self._universe_cache = shared_data_hub.cache(
            "options-universe-v3",
            max_entries=8,
        )
        self._chain_cache = shared_data_hub.cache(
            "options-chain-v3",
            max_entries=400,
        )

    async def _tsx_universe(self) -> tuple[list[OptionUniverseItem], OptionSourceStatus]:
        async def load() -> tuple[list[OptionUniverseItem], OptionSourceStatus]:
            try:
                response = await shared_http_client.request(
                    "GET",
                    _MX_OPTIONS_URL,
                    attempts=1,
                    headers={"Accept": "text/html,application/xhtml+xml"},
                )
                items = _parse_mx_universe(response.text)
                if items:
                    return items, OptionSourceStatus(
                        source="Montréal Exchange",
                        status="available",
                        detail=f"{len(items)} classes d'options officielles indexées.",
                    )
                raise RuntimeError("Aucune classe d'options extraite de la page officielle.")
            except Exception as error:  # noqa: BLE001
                fallback = [
                    OptionUniverseItem(
                        symbol=symbol,
                        name=name,
                        market="tsx",
                        category="Equity / ETF",
                        exchange="Montréal Exchange",
                        provider_symbol=symbol,
                        source_url=_MX_OPTIONS_URL,
                    )
                    for symbol, name in _TSX_FALLBACK
                ]
                return fallback, OptionSourceStatus(
                    source="Montréal Exchange",
                    status="partial",
                    detail=(
                        "La liste officielle est temporairement inaccessible; "
                        f"raccourcis de navigation seulement ({type(error).__name__})."
                    ),
                )

        return await self._universe_cache.get_or_load(
            "tsx",
            load,
            fresh_seconds=21_600,
            stale_seconds=172_800,
        )

    @staticmethod
    def _commodity_universe() -> tuple[list[OptionUniverseItem], OptionSourceStatus]:
        items = [
            OptionUniverseItem(
                symbol=root,
                name=name,
                market="commodities",
                category=category,
                exchange=exchange,
                provider_symbol=root,
                source_url="https://www.barchart.com/ondemand/api/getFuturesOptions",
            )
            for root, name, category, exchange in _COMMODITIES
        ]
        if settings.barchart_api_key:
            detail = (
                f"{len(items)} racines majeures préchargées; toute autre racine de futures "
                "supportée par Barchart peut être saisie manuellement."
            )
            status = "available"
        else:
            detail = (
                f"{len(items)} racines majeures disponibles. Barchart est optionnel : "
                "Anatole utilise aussi les Daily Bulletins publics CME/CBOT/NYMEX/COMEX "
                "sans clé API, et les métadonnées publiques ICE lorsqu'elles existent."
            )
            status = "partial"
        return items, OptionSourceStatus(
            source="Barchart OnDemand",
            status=status,  # type: ignore[arg-type]
            detail=detail,
        )

    async def universe(self, market: str) -> OptionUniverseSnapshot:
        normalized = market.strip().lower()
        if normalized not in {"tsx", "commodities", "all"}:
            raise ValueError("market doit être 'tsx', 'commodities' ou 'all'.")

        items: list[OptionUniverseItem] = []
        statuses: list[OptionSourceStatus] = []
        if normalized in {"tsx", "all"}:
            tsx_items, status = await self._tsx_universe()
            items.extend(tsx_items)
            statuses.append(status)
        if normalized in {"commodities", "all"}:
            commodity_items, status = self._commodity_universe()
            items.extend(commodity_items)
            statuses.append(status)

        return OptionUniverseSnapshot(
            market=normalized,  # type: ignore[arg-type]
            items=items,
            source_statuses=statuses,
            generated_at=datetime.now(UTC),
        )

    async def _find_tsx_item(self, symbol: str) -> OptionUniverseItem:
        items, _ = await self._tsx_universe()
        normalized = symbol.upper()
        for item in items:
            if item.symbol.upper() == normalized or item.provider_symbol.upper() == normalized:
                return item
        return OptionUniverseItem(
            symbol=normalized,
            name=normalized,
            market="tsx",
            category="Canadian option",
            exchange="Montréal Exchange",
            provider_symbol=normalized,
            source_url=_MX_OPTIONS_URL,
        )

    async def _load_mx_chain(
        self,
        item: OptionUniverseItem,
    ) -> tuple[list[OptionContract], list[str], float | None, OptionSourceStatus]:
        try:
            response = await shared_http_client.request(
                "GET",
                _MX_QUOTES_URL,
                attempts=1,
                params={"symbol": f"{item.provider_symbol}*"},
                headers={"Accept": "text/html,application/xhtml+xml"},
            )
            contracts, expirations, underlying_price = _parse_mx_chain(
                response.text,
                underlying=item.symbol,
                provider_symbol=item.provider_symbol,
            )
            if not contracts:
                raise RuntimeError("Chaîne vide dans la page de cotes MX.")
            return (
                contracts,
                expirations,
                underlying_price,
                OptionSourceStatus(
                    source="Montréal Exchange",
                    status="available",
                    detail=f"{len(contracts)} contrats extraits de la cote officielle.",
                ),
            )
        except Exception as error:  # noqa: BLE001
            return (
                [],
                [],
                None,
                OptionSourceStatus(
                    source="Montréal Exchange",
                    status="unavailable",
                    detail=f"Cote officielle indisponible ({type(error).__name__}).",
                ),
            )

    async def _load_barchart_equity(
        self,
        item: OptionUniverseItem,
        expiration: str | None,
    ) -> tuple[list[OptionContract], list[str], OptionSourceStatus]:
        if not settings.barchart_api_key:
            return [], [], OptionSourceStatus(
                source="Barchart OnDemand",
                status="partial",
                detail="BARCHART_API_KEY non configurée; enrichissement IV/Greeks désactivé.",
            )

        last_error: Exception | None = None
        candidates = [item.symbol]
        if not item.symbol.endswith(".TO"):
            candidates.append(f"{item.symbol}.TO")

        for candidate in candidates:
            try:
                params: dict[str, str] = {
                    "apikey": settings.barchart_api_key,
                    "underlying_symbols": candidate,
                    "fields": "bid,ask,volatility,delta,gamma,theta,vega,volume,openInterest",
                }
                if expiration:
                    params["expirationDate"] = expiration
                payload = await shared_http_client.get_json(
                    f"{_BARCHART_BASE}/getEquityOptions.json",
                    attempts=1,
                    params=params,
                )
                results = payload.get("results") or []
                contracts = [
                    parsed
                    for raw in results
                    if isinstance(raw, dict)
                    for parsed in [_barchart_contract(raw, market="tsx", fallback_underlying=item.symbol)]
                    if parsed is not None
                ]
                if contracts:
                    expirations = sorted({contract.expiration for contract in contracts})
                    return contracts, expirations, OptionSourceStatus(
                        source="Barchart OnDemand",
                        status="available",
                        detail=f"{len(contracts)} contrats avec métriques fournisseur.",
                    )
            except Exception as error:  # noqa: BLE001
                last_error = error

        return [], [], OptionSourceStatus(
            source="Barchart OnDemand",
            status="unavailable",
            detail=(
                "Aucune chaîne canadienne exploitable renvoyée"
                + (f" ({type(last_error).__name__})." if last_error else ".")
            ),
        )

    async def _load_yahoo_equity(
        self,
        item: OptionUniverseItem,
        expiration: str | None,
    ) -> tuple[list[OptionContract], list[str], OptionSourceStatus]:
        ticker = item.symbol if item.symbol.endswith(".TO") else f"{item.symbol}.TO"
        params: dict[str, str] = {}
        if expiration:
            try:
                epoch = int(datetime.strptime(expiration, "%Y-%m-%d").replace(tzinfo=UTC).timestamp())
                params["date"] = str(epoch)
            except ValueError:
                pass
        try:
            payload = await shared_http_client.get_json(
                f"{_YAHOO_OPTIONS_BASE}/{ticker}",
                attempts=1,
                params=params,
            )
            result = ((payload.get("optionChain") or {}).get("result") or [])
            if not result:
                raise RuntimeError("Yahoo optionChain vide.")
            chain = result[0]
            expirations = [
                datetime.fromtimestamp(int(value), UTC).date().isoformat()
                for value in chain.get("expirationDates") or []
                if isinstance(value, (int, float))
            ]
            option_sets = chain.get("options") or []
            contracts: list[OptionContract] = []
            if option_sets:
                first = option_sets[0] if isinstance(option_sets[0], dict) else {}
                for raw in first.get("calls") or []:
                    if isinstance(raw, dict):
                        parsed = _yahoo_contract(raw, underlying=item.symbol, side="call")
                        if parsed:
                            contracts.append(parsed)
                for raw in first.get("puts") or []:
                    if isinstance(raw, dict):
                        parsed = _yahoo_contract(raw, underlying=item.symbol, side="put")
                        if parsed:
                            contracts.append(parsed)
            if not contracts:
                raise RuntimeError("Yahoo ne retourne aucun contrat.")
            return contracts, sorted(set(expirations)), OptionSourceStatus(
                source="Yahoo Finance fallback",
                status="available",
                detail=f"{len(contracts)} contrats de repli.",
            )
        except Exception as error:  # noqa: BLE001
            return [], [], OptionSourceStatus(
                source="Yahoo Finance fallback",
                status="unavailable",
                detail=f"Repli Yahoo indisponible ({type(error).__name__}).",
            )

    async def _tsx_chain(
        self,
        item: OptionUniverseItem,
        expiration: str | None,
    ) -> tuple[list[OptionContract], list[str], float | None, list[OptionSourceStatus]]:
        mx_contracts, mx_expirations, underlying_price, mx_status = await self._load_mx_chain(item)
        statuses = [mx_status]

        if mx_contracts:
            if expiration:
                filtered = [contract for contract in mx_contracts if contract.expiration == expiration]
                if filtered:
                    mx_contracts = filtered

            barchart_contracts, _, barchart_status = await self._load_barchart_equity(
                item, expiration
            )
            statuses.append(barchart_status)
            provider_enriched = _merge_provider_metrics(
                mx_contracts,
                barchart_contracts,
            )

            risk_free_rate, model_status = await _risk_free_rate()
            modeled = _apply_black_scholes_metrics(
                mx_contracts,
                underlying_price=underlying_price,
                risk_free_rate=risk_free_rate,
            )
            model_status.detail = (
                f"{model_status.detail} {provider_enriched} contrats enrichis par "
                f"Barchart et {modeled} contrats évalués/complétés par Anatole. "
                "Les IV/Greeks calculés sont des estimations de modèle, pas des "
                "valeurs publiées par la Bourse de Montréal."
            )
            statuses.append(model_status)
            return mx_contracts, mx_expirations, underlying_price, statuses

        barchart_contracts, barchart_expirations, barchart_status = await self._load_barchart_equity(
            item, expiration
        )
        statuses.append(barchart_status)
        if barchart_contracts:
            return barchart_contracts, barchart_expirations, underlying_price, statuses

        yahoo_contracts, yahoo_expirations, yahoo_status = await self._load_yahoo_equity(
            item, expiration
        )
        statuses.append(yahoo_status)
        return yahoo_contracts, yahoo_expirations, underlying_price, statuses

    async def _commodity_chain(
        self,
        root: str,
        expiration: str | None,
        contract: str | None,
    ) -> tuple[list[OptionContract], list[str], list[OptionSourceStatus]]:
        statuses: list[OptionSourceStatus] = []

        # Barchart reste un enrichissement facultatif. S'il est configuré et
        # renvoie une chaîne, on la privilégie pour l'intraday et les champs
        # additionnels. Son absence ne vide plus la section matières premières.
        if settings.barchart_api_key:
            params: dict[str, str] = {
                "apikey": settings.barchart_api_key,
                "root": root,
                "fields": "bid,bidSize,ask,askSize,premium,openInterest",
            }
            if contract:
                params["contract"] = contract
            try:
                payload = await shared_http_client.get_json(
                    f"{_BARCHART_BASE}/getFuturesOptions.json",
                    attempts=1,
                    params=params,
                )
                results = payload.get("results") or []
                provider_contracts = [
                    parsed
                    for raw in results
                    if isinstance(raw, dict)
                    for parsed in [
                        _barchart_contract(
                            raw,
                            market="commodities",
                            fallback_underlying=root,
                        )
                    ]
                    if parsed is not None
                ]
                provider_expirations = sorted(
                    {item.expiration for item in provider_contracts}
                )
                if expiration:
                    provider_contracts = [
                        item for item in provider_contracts
                        if item.expiration == expiration
                    ]
                if provider_contracts:
                    return provider_contracts, provider_expirations, [
                        OptionSourceStatus(
                            source="Barchart OnDemand",
                            status="available",
                            detail=f"{len(provider_contracts)} contrats fournisseur.",
                        )
                    ]
                statuses.append(
                    OptionSourceStatus(
                        source="Barchart OnDemand",
                        status="partial",
                        detail="Aucun contrat fournisseur pour cette racine/échéance; fallback public tenté.",
                    )
                )
            except Exception as error:  # noqa: BLE001
                statuses.append(
                    OptionSourceStatus(
                        source="Barchart OnDemand",
                        status="unavailable",
                        detail=f"Fournisseur indisponible ({type(error).__name__}); fallback public tenté.",
                    )
                )
        else:
            statuses.append(
                OptionSourceStatus(
                    source="Barchart OnDemand",
                    status="partial",
                    detail="Clé non configurée; fournisseur facultatif. Le fallback public des bourses est utilisé.",
                )
            )

        public_contracts, public_expirations, public_status = (
            await public_commodity_options_service.chain(root, expiration)
        )
        statuses.append(public_status)
        return public_contracts, public_expirations, statuses

    async def chain(
        self,
        *,
        market: str,
        symbol: str,
        expiration: str | None = None,
        contract: str | None = None,
    ) -> OptionChainSnapshot:
        normalized_market = market.strip().lower()
        normalized_symbol = symbol.strip().upper()
        if normalized_market not in {"tsx", "commodities"}:
            raise ValueError("market doit être 'tsx' ou 'commodities'.")
        if not re.fullmatch(r"[A-Z0-9.^-]{1,16}", normalized_symbol):
            raise ValueError("Symbole d'option invalide.")
        if expiration and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", expiration):
            raise ValueError("expiration doit être au format YYYY-MM-DD.")
        if contract and not re.fullmatch(r"[A-Z0-9.^|-]{1,32}", contract.upper()):
            raise ValueError("Contrat de futures invalide.")

        key = (
            normalized_market,
            normalized_symbol,
            expiration or "",
            (contract or "").upper(),
        )

        async def load() -> OptionChainSnapshot:
            if normalized_market == "tsx":
                item = await self._find_tsx_item(normalized_symbol)
                contracts, expirations, underlying_price, statuses = await self._tsx_chain(
                    item, expiration
                )
                return OptionChainSnapshot(
                    market="tsx",
                    symbol=item.symbol,
                    provider_symbol=item.provider_symbol,
                    name=item.name,
                    category=item.category,
                    exchange=item.exchange,
                    underlying_price=underlying_price,
                    requested_expiration=expiration,
                    expirations=expirations,
                    contracts=contracts[:5000],
                    analytics=_analytics(contracts, underlying_price),
                    source_statuses=statuses,
                    generated_at=datetime.now(UTC),
                )

            catalog = {root: (name, category, exchange) for root, name, category, exchange in _COMMODITIES}
            name, category, exchange = catalog.get(
                normalized_symbol,
                (normalized_symbol, "Custom futures root", "Provider"),
            )
            contracts, expirations, statuses = await self._commodity_chain(
                normalized_symbol,
                expiration,
                contract.upper() if contract else None,
            )
            return OptionChainSnapshot(
                market="commodities",
                symbol=normalized_symbol,
                provider_symbol=normalized_symbol,
                name=name,
                category=category,
                exchange=exchange,
                requested_expiration=expiration,
                expirations=expirations,
                contracts=contracts[:5000],
                analytics=_analytics(contracts, None),
                source_statuses=statuses,
                generated_at=datetime.now(UTC),
            )

        return await self._chain_cache.get_or_load(
            key,
            load,
            fresh_seconds=20,
            stale_seconds=900,
        )


options_service = OptionsService()