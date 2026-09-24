from __future__ import annotations

import io
import re
from calendar import monthrange
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Iterable

from pypdf import PdfReader

from app.core.resilience import shared_http_client
from app.schemas.options import OptionContract, OptionSourceStatus


_CME_ENERGY = "https://www.cmegroup.com/daily_bulletin/current/Section63_Energy_Options_Products.pdf"
_CME_METALS = "https://www.cmegroup.com/daily_bulletin/current/Section64_Metals_Option_Products.pdf"
_CME_GRAINS_56 = "https://www.cmegroup.com/daily_bulletin/current/Section56_Corn_Oat_RoughRice_Options.pdf"
_CME_GRAINS_57 = "https://www.cmegroup.com/daily_bulletin/current/Section57_Soybean_Soymeal_Soyoil_SoybeanCrush_wheat_Options.pdf"
_CME_LIVE_CATTLE_CALL = "https://www.cmegroup.com/daily_bulletin/current/Section15_Live_Cattle_Call_Options.pdf"
_CME_LIVE_CATTLE_PUT = "https://www.cmegroup.com/daily_bulletin/current/Section16_Live_Cattle_Put_Options.pdf"
_CME_FEEDER_CATTLE_CALL = "https://www.cmegroup.com/daily_bulletin/current/Section17_Feeder_Cattle_Call_Options.pdf"
_CME_FEEDER_CATTLE_PUT = "https://www.cmegroup.com/daily_bulletin/current/Section18_Feeder_Cattle_Put_Options.pdf"
_CME_LEAN_HOGS_CALL = "https://www.cmegroup.com/daily_bulletin/current/Section19_Lean_Hogs_Call_Options.pdf"
_CME_LEAN_HOGS_PUT = "https://www.cmegroup.com/daily_bulletin/current/Section20_Lean_Hogs_Put_Options.pdf"
_CME_LUMBER = "https://www.cmegroup.com/daily_bulletin/current/Section23_Lumber_Options.pdf"

_ICE_EXPIRY_URLS = {
    "CC": "https://www.ice.com/products/8/Cocoa-Options/expiry",
    "KC": "https://www.ice.com/products/14/Coffee-C-Options/expiry",
    "SB": "https://www.ice.com/products/22/Sugar-No-11-Options/expiry",
    "CT": "https://www.ice.com/products/1027/Cotton-No-2-Options/expiry",
    "OJ": "https://www.ice.com/products/29/FCOJ-A-Options/expiry",
    "RS": "https://www.ice.com/products/250/Canola-Options/expiry",
}

_MONTHS = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}


@dataclass(frozen=True)
class CmePublicConfig:
    urls: tuple[str, ...]
    exchange: str
    header_phrases: tuple[str, ...]
    exclude_phrases: tuple[str, ...] = ()
    strike_divisor: float = 1.0


_CME_PUBLIC: dict[str, CmePublicConfig] = {
    "CL": CmePublicConfig((_CME_ENERGY,), "NYMEX", ("LIGHT SWEET CRUDE OIL", "WTI AMERICAN STYLE"), ("BRENT",), 100.0),
    "BZ": CmePublicConfig((_CME_ENERGY,), "NYMEX", ("BRENT CRUDE OIL",), (), 100.0),
    "NG": CmePublicConfig((_CME_ENERGY,), "NYMEX", ("NATURAL GAS",), ("LOOK-ALIKE",), 1000.0),
    "RB": CmePublicConfig((_CME_ENERGY,), "NYMEX", ("RBOB GASOLINE",), (), 10000.0),
    "HO": CmePublicConfig((_CME_ENERGY,), "NYMEX", ("ULSD", "HEATING OIL"), (), 10000.0),
    "GC": CmePublicConfig((_CME_METALS,), "COMEX", ("GOLD OPTIONS",), ("MICRO", "WEEKLY"), 1.0),
    "SI": CmePublicConfig((_CME_METALS,), "COMEX", ("SILVER OPTIONS",), ("MICRO", "WEEKLY"), 100.0),
    "HG": CmePublicConfig((_CME_METALS,), "COMEX", ("COPPER OPTIONS",), ("MICRO",), 10000.0),
    "PL": CmePublicConfig((_CME_METALS,), "NYMEX", ("PLATINUM",), ("WEEKLY",), 1.0),
    "PA": CmePublicConfig((_CME_METALS,), "NYMEX", ("PALLADIUM",), ("WEEKLY",), 1.0),
    "ZC": CmePublicConfig((_CME_GRAINS_56,), "CBOT", ("CORN CALL", "CORN PUT"), ("CSO", "NRBY"), 1.0),
    "ZO": CmePublicConfig((_CME_GRAINS_56,), "CBOT", ("OAT CALL", "OAT PUT"), ("CSO",), 1.0),
    "ZR": CmePublicConfig((_CME_GRAINS_56,), "CBOT", ("ROUGH RICE CALL", "ROUGH RICE PUT"), ("CSO",), 1.0),
    "ZS": CmePublicConfig((_CME_GRAINS_57,), "CBOT", ("SOYBEAN CALL SOYBEAN OPTIONS", "SOYBEAN PUT SOYBEAN OPTIONS"), ("SHORT DATED", "CSO"), 1.0),
    "ZM": CmePublicConfig((_CME_GRAINS_57,), "CBOT", ("SOYMEAL CALL", "SOYMEAL PUT"), ("CSO",), 1.0),
    "ZL": CmePublicConfig((_CME_GRAINS_57,), "CBOT", ("SOYBEAN OIL CALL", "SOYBEAN OIL PUT"), ("CSO",), 1.0),
    "ZW": CmePublicConfig((_CME_GRAINS_57,), "CBOT", ("WHEAT CALL WHEAT OPTIONS", "WHEAT PUT WHEAT OPTIONS"), ("KC WHEAT", "CSO"), 1.0),
    "KE": CmePublicConfig((_CME_GRAINS_57,), "CBOT", ("KC HRW CALL KC WHEAT OPTIONS", "KC HRW PUT KC WHEAT OPTIONS"), (), 1.0),
    "LE": CmePublicConfig((_CME_LIVE_CATTLE_CALL, _CME_LIVE_CATTLE_PUT), "CME", ("LIVE CATTLE CALL", "LIVE CATTLE PUT", "LV CATTLE CALL", "LV CATTLE PUT"), (), 10.0),
    "GF": CmePublicConfig((_CME_FEEDER_CATTLE_CALL, _CME_FEEDER_CATTLE_PUT), "CME", ("FEEDER CATTLE CALL", "FEEDER CATTLE PUT"), (), 10.0),
    "HE": CmePublicConfig((_CME_LEAN_HOGS_CALL, _CME_LEAN_HOGS_PUT), "CME", ("LEAN HOGS CALL", "LEAN HOGS PUT"), (), 10.0),
    "LBR": CmePublicConfig((_CME_LUMBER,), "CME", ("LUMBER CALL", "LUMBER PUT", "LUMBER OPTIONS"), (), 1.0),
}

_MONTH_RE = re.compile(r"^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})\b")
_ROW_RE = re.compile(
    r"^(?P<strike>-?\d+(?:\.\d+)?)\s+.*?\s+"
    r"(?P<settle>\d+(?:\.\d+)?)\s+"
    r"(?:(?P<sign>[+-])\s+(?P<change>\d+(?:\.\d+)?)|UNCH|NEW)\s+"
    r"(?P<delta>-?(?:\d+\.\d+|\.\d+))\s+(?P<rest>.+)$"
)
_OI_RE = re.compile(r"\b(?P<oi>\d[\d,]*)\s+(?:UNCH|[+-]\s+\d[\d,]*)\b")
_INTEGER_RE = re.compile(r"(?<![\d.])\d[\d,]*(?![\d.])")


def _month_end(month_code: str) -> str:
    match = _MONTH_RE.match(month_code.upper())
    if not match:
        raise ValueError(month_code)
    month = _MONTHS[match.group(1)]
    year = 2000 + int(match.group(2))
    day = monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-{day:02d}"


def _source_side(line: str, config: CmePublicConfig) -> str | None:
    upper = line.upper()
    if any(phrase in upper for phrase in config.exclude_phrases):
        return None
    if not any(phrase in upper for phrase in config.header_phrases):
        return None
    if "CALL" in upper:
        return "call"
    if "PUT" in upper:
        return "put"
    return None


def _looks_like_other_option_header(line: str) -> bool:
    upper = line.upper().strip()
    if len(upper) > 110:
        return False
    return (
        (" CALL" in upper or " PUT" in upper or upper.endswith("CALLS") or upper.endswith("PUTS"))
        and bool(re.search(r"[A-Z]{3,}", upper))
        and not upper[0].isdigit()
    )


def parse_cme_bulletin_text(
    text: str,
    *,
    root: str,
    config: CmePublicConfig,
) -> list[OptionContract]:
    contracts: list[OptionContract] = []
    active_side: str | None = None
    expiration: str | None = None

    for raw_line in text.splitlines():
        line = " ".join(raw_line.split())
        if not line:
            continue

        side = _source_side(line, config)
        if side:
            active_side = side
            expiration = None
            continue

        # Contract-month lines such as "OCT26 LV CATTLE CALL (...)" can
        # contain CALL/PUT text. Resolve the month before the generic
        # "other option header" guard, otherwise a valid contract month is
        # mistaken for a new product heading and the following strike rows
        # are discarded.
        month_match = _MONTH_RE.match(line.upper())
        if active_side and month_match:
            expiration = _month_end(month_match.group(0))
            continue

        if active_side and _looks_like_other_option_header(line):
            active_side = None
            expiration = None
            continue

        if not active_side:
            continue

        if expiration is None:
            continue

        row = _ROW_RE.match(line)
        if not row:
            continue

        strike = float(row.group("strike")) / config.strike_divisor
        settle = float(row.group("settle"))
        delta = float(row.group("delta"))
        rest = row.group("rest")

        oi_matches = list(_OI_RE.finditer(rest))
        open_interest = 0
        volume = 0
        if oi_matches:
            oi_match = oi_matches[-1]
            open_interest = int(oi_match.group("oi").replace(",", ""))
            before_oi = rest[: oi_match.start()]
            integers = [
                int(value.replace(",", ""))
                for value in _INTEGER_RE.findall(before_oi)
            ]
            if integers:
                volume = integers[-1]

        symbol = f"{root}|{expiration}|{strike:g}{active_side[0].upper()}|CME-EOD"
        contracts.append(
            OptionContract(
                symbol=symbol,
                underlying=root,
                market="commodities",
                contract=expiration[:7],
                side=active_side,  # type: ignore[arg-type]
                strike=strike,
                expiration=expiration,
                exchange=config.exchange,
                last=settle,
                volume=volume,
                open_interest=open_interest,
                delta=delta,
                source="CME Daily Bulletin EOD",
                delayed=True,
            )
        )

    deduped: dict[tuple[str, str, float], OptionContract] = {}
    for item in contracts:
        key = (item.expiration, item.side, round(item.strike, 8))
        previous = deduped.get(key)
        if previous is None:
            deduped[key] = item
            continue
        if (item.volume or 0) + (item.open_interest or 0) > (
            (previous.volume or 0) + (previous.open_interest or 0)
        ):
            deduped[key] = item
    return sorted(
        deduped.values(),
        key=lambda item: (item.expiration, item.strike, item.side),
    )


def _extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _ice_expirations(html: str) -> list[str]:
    matches = re.findall(
        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{2}\b"
        r".{0,160}?(\d{1,2}/\d{1,2}/\d{4})"
        r".{0,160}?(\d{1,2}/\d{1,2}/\d{4})",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    output: list[str] = []
    for _, value in matches:
        try:
            output.append(datetime.strptime(value, "%m/%d/%Y").date().isoformat())
        except ValueError:
            continue
    return sorted(dict.fromkeys(output))


class PublicCommodityOptionsService:
    async def _cme_chain(
        self,
        root: str,
        config: CmePublicConfig,
    ) -> tuple[list[OptionContract], list[str], OptionSourceStatus]:
        contracts: list[OptionContract] = []
        successes = 0
        for url in config.urls:
            try:
                response = await shared_http_client.request(
                    "GET",
                    url,
                    attempts=1,
                    headers={"Accept": "application/pdf"},
                )
                parsed = parse_cme_bulletin_text(
                    _extract_pdf_text(response.content),
                    root=root,
                    config=config,
                )
                if parsed:
                    successes += 1
                    contracts.extend(parsed)
            except Exception:
                continue

        deduped: dict[tuple[str, str, float], OptionContract] = {}
        for item in contracts:
            key = (item.expiration, item.side, round(item.strike, 8))
            previous = deduped.get(key)
            if previous is None or (
                (item.volume or 0) + (item.open_interest or 0)
                > (previous.volume or 0) + (previous.open_interest or 0)
            ):
                deduped[key] = item

        final = sorted(
            deduped.values(),
            key=lambda item: (item.expiration, item.strike, item.side),
        )
        expirations = sorted({item.expiration for item in final})
        if final:
            return final, expirations, OptionSourceStatus(
                source="CME Group public EOD",
                status="available",
                detail=(
                    f"{len(final)} contrats extraits du Daily Bulletin public "
                    f"({successes}/{len(config.urls)} rapport(s)). Données fin de séance; "
                    "les échéances sont affichées par mois de contrat."
                ),
            )
        return [], [], OptionSourceStatus(
            source="CME Group public EOD",
            status="unavailable",
            detail="Daily Bulletin public reçu sans chaîne exploitable pour cette racine.",
        )

    async def _ice_metadata(
        self,
        root: str,
        url: str,
    ) -> tuple[list[OptionContract], list[str], OptionSourceStatus]:
        try:
            response = await shared_http_client.request(
                "GET",
                url,
                attempts=1,
                headers={"Accept": "text/html,application/xhtml+xml"},
            )
            expirations = _ice_expirations(response.text)
            return [], expirations, OptionSourceStatus(
                source="ICE public reports",
                status="partial",
                detail=(
                    f"{len(expirations)} échéance(s) publique(s) détectée(s). ICE publie "
                    "les métadonnées et rapports EOD, mais la chaîne strike/prix complète "
                    "n'est pas exposée ici comme flux public réutilisable."
                ),
            )
        except Exception as error:  # noqa: BLE001
            return [], [], OptionSourceStatus(
                source="ICE public reports",
                status="unavailable",
                detail=f"Métadonnées ICE indisponibles ({type(error).__name__}).",
            )

    async def chain(
        self,
        root: str,
        expiration: str | None = None,
    ) -> tuple[list[OptionContract], list[str], OptionSourceStatus]:
        normalized = root.strip().upper()
        config = _CME_PUBLIC.get(normalized)
        if config is not None:
            contracts, expirations, status = await self._cme_chain(normalized, config)
            if expiration:
                contracts = [
                    item for item in contracts
                    if item.expiration == expiration
                ]
            return contracts, expirations, status

        ice_url = _ICE_EXPIRY_URLS.get(normalized)
        if ice_url is not None:
            return await self._ice_metadata(normalized, ice_url)

        return [], [], OptionSourceStatus(
            source="Public exchange fallback",
            status="unavailable",
            detail="Aucun fallback public sans clé n'est encore défini pour cette racine.",
        )


public_commodity_options_service = PublicCommodityOptionsService()
