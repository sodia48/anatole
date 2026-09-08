from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx


VANGUARD_GRAPHQL_URL = "https://www.vanguard.ca/gpx/graphql"
VANGUARD_PRODUCT_URL = (
    "https://www.vanguard.ca/en/product/etf/equity/9563/"
    "vanguard-sp-500-index-etf"
)
VANGUARD_PRODUCT_IDS = {"VFV": "9563"}
VANGUARD_SECURITY_TYPES = [
    "FI.ABS",
    "FI.CONV",
    "FI.CORP",
    "FI.IP",
    "FI.LOAN",
    "FI.MBS",
    "FI.MUNI",
    "FI.NONUS_GOV",
    "FI.US_GOV",
    "MM.AGC",
    "MM.BACC",
    "MM.CD",
    "MM.CP",
    "MM.MCP",
    "MM.RE",
    "MM.TBILL",
    "MM.TD",
    "MM.TFN",
    "EQ.DRCPT",
    "EQ.ETF",
    "EQ.FSH",
    "EQ.PREF",
    "EQ.PSH",
    "EQ.REIT",
    "EQ.STOCK",
    "EQ.RIGHT",
    "EQ.WRT",
    "MF.MF",
]
VANGUARD_HOLDINGS_QUERY = """
query FundsHoldingsQuery(
  $portIds: [String!]!
  $lastItemKey: String
  $securityTypes: [String!]
) {
  funds(portIds: $portIds) {
    profile { fundFullName primarySectorEquityClassification }
  }
  borHoldings(portIds: $portIds) {
    delayeredHoldings(
      limit: 1500
      securityTypes: $securityTypes
      lastItemKey: $lastItemKey
    ) {
      items {
        issuerName
        securityLongDescription
        gicsSectorDescription
        icbSectorDescription
        marketValuePercentage
        ticker
        securityType
        effectiveDate
        bloombergIsoCountry
      }
      totalHoldings
      lastItemKey
    }
  }
}
"""


@dataclass(slots=True)
class OfficialEtfComposition:
    name: str | None
    rows: list[dict[str, Any]]
    sectors: dict[str, float]
    regions: dict[str, float]
    asset_classes: dict[str, float]
    composition_as_of: date | None
    source_name: str
    source_url: str


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _verified_ticker(value: Any) -> tuple[str, str] | None:
    ticker = str(value or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9./-]{0,14}", ticker):
        return None
    quote_symbol = ticker.replace("/", "-").replace(".", "-")
    return quote_symbol, ticker.replace("/", ".").replace("-", ".")


def parse_vanguard_holdings_payload(
    payload: dict[str, Any],
    *,
    limit: int,
) -> OfficialEtfComposition:
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ValueError("Vanguard holdings response has no data")

    funds = data.get("funds") or []
    holdings_nodes = data.get("borHoldings") or []
    profile = (
        funds[0].get("profile", {})
        if funds and isinstance(funds[0], dict)
        else {}
    )
    delayed = (
        holdings_nodes[0].get("delayeredHoldings", {})
        if holdings_nodes and isinstance(holdings_nodes[0], dict)
        else {}
    )
    items = delayed.get("items") or []
    if not isinstance(items, list):
        raise ValueError("Vanguard holdings response is malformed")

    rows: list[dict[str, Any]] = []
    sectors: dict[str, float] = {}
    regions: dict[str, float] = {}
    asset_classes: dict[str, float] = {}
    effective_dates: list[date] = []

    for item in items:
        if not isinstance(item, dict):
            continue
        weight = _number(item.get("marketValuePercentage"))
        if weight is None or weight <= 0:
            continue

        sector = str(
            item.get("gicsSectorDescription")
            or item.get("icbSectorDescription")
            or ""
        ).strip()
        region = str(item.get("bloombergIsoCountry") or "").strip()
        security_type = str(item.get("securityType") or "")
        if sector:
            sectors[sector] = sectors.get(sector, 0.0) + weight
        if region:
            regions[region] = regions.get(region, 0.0) + weight
        asset_key = (
            "stockPosition"
            if security_type.startswith("EQ.")
            else "bondPosition"
            if security_type.startswith("FI.")
            else "cashPosition"
            if security_type.startswith("MM.")
            else "otherPosition"
        )
        asset_classes[asset_key] = asset_classes.get(asset_key, 0.0) + weight

        raw_date = str(item.get("effectiveDate") or "")[:10]
        try:
            effective_dates.append(date.fromisoformat(raw_date))
        except ValueError:
            pass

        verified = _verified_ticker(item.get("ticker"))
        if verified is None:
            continue
        symbol, display_symbol = verified
        rows.append(
            {
                "symbol": symbol,
                "display_symbol": display_symbol,
                "name": str(
                    item.get("issuerName")
                    or item.get("securityLongDescription")
                    or display_symbol
                ).strip(),
                "weight_percent": weight,
                "instrument_type": (
                    "etf"
                    if security_type == "EQ.ETF"
                    else "equity"
                    if security_type.startswith("EQ.")
                    else "other"
                ),
                "sector": sector or None,
                "region": region or None,
            }
        )

    rows.sort(key=lambda item: item["weight_percent"], reverse=True)
    if not rows:
        raise ValueError("Vanguard published no verified holdings")

    return OfficialEtfComposition(
        name=str(profile.get("fundFullName") or "").strip() or None,
        rows=rows[:limit],
        sectors=sectors,
        regions=regions,
        asset_classes=asset_classes,
        composition_as_of=max(effective_dates) if effective_dates else None,
        source_name="Vanguard Canada",
        source_url=VANGUARD_PRODUCT_URL,
    )


class VanguardCanadaHoldingsProvider:
    def supports(self, ticker: str) -> bool:
        return ticker.strip().upper() in VANGUARD_PRODUCT_IDS

    async def get_composition(
        self,
        ticker: str,
        *,
        limit: int,
    ) -> OfficialEtfComposition:
        clean_ticker = ticker.strip().upper()
        product_id = VANGUARD_PRODUCT_IDS.get(clean_ticker)
        if product_id is None:
            raise ValueError("Unsupported Vanguard Canada ETF")

        body = {
            "operationName": "FundsHoldingsQuery",
            "variables": {
                "portIds": [product_id],
                "lastItemKey": None,
                "securityTypes": VANGUARD_SECURITY_TYPES,
            },
            "query": VANGUARD_HOLDINGS_QUERY,
        }
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Anatole/1.0 ETF holdings research",
            "apollographql-client-name": "gpx",
            "x-consumer-id": "ca0",
        }
        timeout = httpx.Timeout(connect=8.0, read=25.0, write=8.0, pool=8.0)
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            headers=headers,
        ) as client:
            response = await client.post(VANGUARD_GRAPHQL_URL, json=body)
            response.raise_for_status()
            payload = response.json()

        return parse_vanguard_holdings_payload(payload, limit=limit)


vanguard_canada_holdings_provider = VanguardCanadaHoldingsProvider()
