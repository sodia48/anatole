from __future__ import annotations

import asyncio
import hashlib
import math
import os
import re
from datetime import UTC, date, datetime, timedelta
from time import monotonic
from typing import Any
from urllib.parse import urljoin
from xml.etree import ElementTree

import httpx
import pandas as pd

from app.schemas.ipo_insiders import (
    InsiderSnapshot,
    InsiderSourceStatus,
    InsiderSummary,
    InsiderTrade,
)


SEDI_URL = (
    "https://www.sedi.ca/sedi/"
    "SVTReportsAccessController"
    "?locale=en_CA&menukey=15.03.00"
)
SEC_CURRENT_URL = "https://www.sec.gov/cgi-bin/browse-edgar"
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
CACHE_SECONDS = 900
REQUEST_TIMEOUT_SECONDS = 22
UNUSUAL_VALUE = 1_000_000
UNUSUAL_SHARES = 100_000

FALLBACK_TSX60: tuple[tuple[str, str], ...] = (
    ("RY", "Royal Bank of Canada"),
    ("TD", "Toronto-Dominion Bank"),
    ("SHOP", "Shopify"),
    ("BMO", "Bank of Montreal"),
    ("CM", "Canadian Imperial Bank of Commerce"),
    ("BNS", "Bank of Nova Scotia"),
    ("BN", "Brookfield Corporation"),
    ("MFC", "Manulife Financial"),
    ("NA", "National Bank of Canada"),
    ("ENB", "Enbridge"),
    ("CNQ", "Canadian Natural Resources"),
    ("TRP", "TC Energy"),
    ("SU", "Suncor Energy"),
    ("CP", "Canadian Pacific Kansas City"),
    ("CNR", "Canadian National Railway"),
    ("AEM", "Agnico Eagle Mines"),
    ("ABX", "Barrick Mining"),
    ("ATD", "Alimentation Couche-Tard"),
    ("WCN", "Waste Connections"),
    ("FTS", "Fortis"),
    ("BCE", "BCE"),
    ("T", "TELUS"),
    ("CSU", "Constellation Software"),
    ("CLS", "Celestica"),
)

SEC_CODES = {
    "P": ("buy", "Achat au marché"),
    "S": ("sell", "Vente au marché"),
    "A": ("grant", "Attribution"),
    "M": ("exercise", "Exercice d’options"),
    "F": ("tax", "Retenue fiscale"),
    "C": ("exercise", "Conversion"),
    "G": ("other", "Don"),
    "J": ("other", "Autre opération"),
}


def safe_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        parsed = float(
            str(value).replace(",", "").replace("$", "").strip()
        )
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def safe_date(value: Any) -> date | None:
    if value is None:
        return None
    parsed = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(parsed):
        return None
    return parsed.date()


def row_value(row: pd.Series, *names: str) -> Any:
    lookup = {
        str(column).strip().lower(): column
        for column in row.index
    }
    for name in names:
        column = lookup.get(name.lower())
        if column is not None:
            return row[column]
    return None


def display_ticker(value: str) -> str:
    symbol = value.strip().upper()
    for suffix in (".TO", ".V", ".NE", ".CN"):
        if symbol.endswith(suffix):
            symbol = symbol[:-len(suffix)]
            break
    return symbol.replace("-", ".")


def canadian_symbol(value: str) -> str:
    symbol = value.strip().upper()
    if symbol.endswith((".TO", ".V", ".NE", ".CN")):
        return symbol
    return f"{symbol.replace('.', '-')}.TO"


def trade_id(*parts: Any) -> str:
    return hashlib.sha1(
        "|".join(str(part or "") for part in parts).encode()
    ).hexdigest()[:20]


def infer_transaction_type(
    transaction: str = "",
    text: str = "",
    *,
    acquired_disposed: str = "",
    code: str = "",
) -> tuple[str, str]:
    code = code.strip().upper()
    if code in SEC_CODES:
        return SEC_CODES[code]
    value = f"{transaction} {text}".lower()
    if any(token in value for token in ("purchase", "buy", "acquisition", "acquired")):
        return "buy", "Achat"
    if any(token in value for token in ("sale", "sell", "disposition", "disposed")):
        return "sell", "Vente"
    if any(token in value for token in ("grant", "award", "restricted stock")):
        return "grant", "Attribution"
    if any(token in value for token in ("exercise", "conversion", "option")):
        return "exercise", "Exercice d’options"
    if any(token in value for token in ("tax", "withhold")):
        return "tax", "Retenue fiscale"
    if acquired_disposed.upper() == "A":
        return "buy", "Acquisition"
    if acquired_disposed.upper() == "D":
        return "sell", "Disposition"
    return "other", "Autre"


def parse_yahoo_insider_frame(
    frame: pd.DataFrame,
    *,
    ticker: str,
    company: str,
) -> list[InsiderTrade]:
    if not isinstance(frame, pd.DataFrame) or frame.empty:
        return []
    output: list[InsiderTrade] = []
    clean_ticker = display_ticker(ticker)
    source_url = (
        "https://finance.yahoo.com/quote/"
        f"{canadian_symbol(clean_ticker)}/insider-transactions/"
    )
    for _, row in frame.iterrows():
        insider = str(
            row_value(row, "Insider", "Insider Name", "Name")
            or "N/D"
        ).strip()
        role = str(
            row_value(row, "Position", "Relation", "Title")
            or ""
        ).strip()
        transaction = str(
            row_value(row, "Transaction", "Type")
            or ""
        ).strip()
        text = str(
            row_value(row, "Text", "Description")
            or ""
        ).strip()
        shares = safe_float(
            row_value(row, "Shares", "Share", "Securities")
        )
        value = safe_float(
            row_value(row, "Value", "Transaction Value")
        )
        price = safe_float(
            row_value(row, "Price", "Price Per Share")
        )
        if price is None and value is not None and shares not in (None, 0):
            price = abs(value / shares)
        trade_date = safe_date(
            row_value(row, "Start Date", "Date", "Transaction Date")
        )
        ownership = str(
            row_value(row, "Ownership", "Ownership Type")
            or ""
        ).strip()
        transaction_type, label = infer_transaction_type(
            transaction, text
        )
        output.append(
            InsiderTrade(
                id=trade_id(
                    "yahoo", clean_ticker, insider,
                    trade_date, transaction, shares, value,
                ),
                ticker=clean_ticker,
                company=company or clean_ticker,
                market="Canada",
                insider_name=insider,
                role=role,
                transaction_type=transaction_type,
                transaction_label=label,
                trade_date=trade_date,
                shares=shares,
                price=price,
                value=abs(value) if value is not None else None,
                ownership=ownership,
                unusual=(
                    abs(value or 0) >= UNUSUAL_VALUE
                    or abs(shares or 0) >= UNUSUAL_SHARES
                ),
                source_name="Yahoo Finance — source secondaire",
                source_url=source_url,
                official_verification_url=SEDI_URL,
                official_source=False,
            )
        )
    return output


def xml_text(
    node: ElementTree.Element | None,
    path: str,
) -> str:
    if node is None:
        return ""
    found = node.find(path)
    if found is None or found.text is None:
        return ""
    return found.text.strip()


def parse_sec_ownership_xml(
    xml_document: str,
    *,
    source_url: str,
) -> list[InsiderTrade]:
    try:
        root = ElementTree.fromstring(xml_document)
    except ElementTree.ParseError:
        return []
    ticker = xml_text(root, "./issuer/issuerTradingSymbol").upper()
    company = xml_text(root, "./issuer/issuerName")
    filing_date = safe_date(xml_text(root, "./periodOfReport"))
    owner = root.find("./reportingOwner")
    insider_name = xml_text(
        owner, "./reportingOwnerId/rptOwnerName"
    )
    relationship = (
        owner.find("./reportingOwnerRelationship")
        if owner is not None else None
    )
    role_parts: list[str] = []
    if xml_text(relationship, "./isDirector") == "1":
        role_parts.append("Administrateur")
    if xml_text(relationship, "./isOfficer") == "1":
        role_parts.append(
            xml_text(relationship, "./officerTitle")
            or "Dirigeant"
        )
    if xml_text(relationship, "./isTenPercentOwner") == "1":
        role_parts.append("Actionnaire 10 %")
    if xml_text(relationship, "./isOther") == "1":
        role_parts.append(
            xml_text(relationship, "./otherText")
            or "Autre initié"
        )
    output: list[InsiderTrade] = []

    def consume(
        transaction: ElementTree.Element,
        *,
        derivative: bool,
    ) -> None:
        trade_date = safe_date(
            xml_text(transaction, "./transactionDate/value")
        )
        code = xml_text(
            transaction, "./transactionCoding/transactionCode"
        )
        shares = safe_float(
            xml_text(
                transaction,
                "./transactionAmounts/transactionShares/value",
            )
        )
        price = safe_float(
            xml_text(
                transaction,
                "./transactionAmounts/transactionPricePerShare/value",
            )
        )
        acquired_disposed = xml_text(
            transaction,
            "./transactionAmounts/transactionAcquiredDisposedCode/value",
        )
        holdings_after = safe_float(
            xml_text(
                transaction,
                "./postTransactionAmounts/sharesOwnedFollowingTransaction/value",
            )
        )
        ownership = xml_text(
            transaction,
            "./ownershipNature/directOrIndirectOwnership/value",
        )
        transaction_type, label = infer_transaction_type(
            acquired_disposed=acquired_disposed,
            code=code,
        )
        if derivative and transaction_type == "other":
            transaction_type = "exercise"
            label = "Opération sur dérivé"
        value = (
            abs(shares * price)
            if shares is not None and price is not None
            else None
        )
        output.append(
            InsiderTrade(
                id=trade_id(
                    "sec", ticker, insider_name, trade_date,
                    code, shares, price, derivative,
                ),
                ticker=ticker,
                company=company or ticker,
                market="États-Unis",
                insider_name=insider_name or "N/D",
                role=" · ".join(role_parts),
                transaction_type=transaction_type,
                transaction_label=label,
                transaction_code=code,
                trade_date=trade_date,
                filing_date=filing_date,
                shares=shares,
                price=price,
                value=value,
                holdings_after=holdings_after,
                ownership=ownership,
                unusual=(
                    abs(value or 0) >= UNUSUAL_VALUE
                    or abs(shares or 0) >= UNUSUAL_SHARES
                ),
                source_name="SEC EDGAR — Form 4",
                source_url=source_url,
                official_verification_url=source_url,
                official_source=True,
            )
        )

    for transaction in root.findall(
        "./nonDerivativeTable/nonDerivativeTransaction"
    ):
        consume(transaction, derivative=False)
    for transaction in root.findall(
        "./derivativeTable/derivativeTransaction"
    ):
        consume(transaction, derivative=True)
    return output


def deduplicate_trades(
    trades: list[InsiderTrade],
) -> list[InsiderTrade]:
    output: list[InsiderTrade] = []
    seen: set[tuple[str, str, str, str, str, int]] = set()
    for trade in sorted(
        trades,
        key=lambda item: (
            item.trade_date or date.min,
            item.filing_date or date.min,
        ),
        reverse=True,
    ):
        key = (
            trade.market,
            trade.ticker,
            trade.insider_name.lower(),
            str(trade.trade_date or ""),
            trade.transaction_type,
            round(trade.shares or 0),
        )
        if key in seen:
            continue
        seen.add(key)
        output.append(trade)
    return output


def summarize_trades(
    trades: list[InsiderTrade],
) -> InsiderSummary:
    buys = [
        trade for trade in trades
        if trade.transaction_type == "buy"
    ]
    sells = [
        trade for trade in trades
        if trade.transaction_type == "sell"
    ]
    denominator = len(buys) + len(sells)
    buy_value = sum(trade.value or 0 for trade in buys)
    sell_value = sum(trade.value or 0 for trade in sells)
    return InsiderSummary(
        transactions=len(trades),
        companies=len({trade.ticker for trade in trades if trade.ticker}),
        buys=len(buys),
        sells=len(sells),
        grants_and_exercises=sum(
            trade.transaction_type in {"grant", "exercise", "tax"}
            for trade in trades
        ),
        buy_value=buy_value,
        sell_value=sell_value,
        net_value=buy_value - sell_value,
        buy_ratio_percent=(
            len(buys) / denominator * 100
            if denominator else 0
        ),
        unusual_transactions=sum(trade.unusual for trade in trades),
    )


def tsx60_directory() -> list[tuple[str, str]]:
    try:
        from app.services import tsx60 as module
        candidate = getattr(module, "TSX60", None)
        if isinstance(candidate, dict):
            return [
                (str(symbol), str(name))
                for symbol, name in candidate.items()
            ]
        if isinstance(candidate, (list, tuple)):
            output: list[tuple[str, str]] = []
            for item in candidate:
                if isinstance(item, str):
                    output.append((item, item))
                elif isinstance(item, dict):
                    symbol = str(
                        item.get("symbol")
                        or item.get("ticker")
                        or ""
                    )
                    name = str(item.get("name") or symbol)
                    if symbol:
                        output.append((symbol, name))
                else:
                    symbol = str(
                        getattr(
                            item,
                            "symbol",
                            getattr(item, "ticker", ""),
                        )
                    )
                    name = str(getattr(item, "name", symbol))
                    if symbol:
                        output.append((symbol, name))
            if output:
                return output
    except Exception:
        pass
    return list(FALLBACK_TSX60)


def fetch_yahoo_sync(
    ticker: str,
    company: str,
) -> list[InsiderTrade]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError(
            "yfinance is required for Canadian insider data"
        ) from exc
    obj = yf.Ticker(canadian_symbol(ticker))
    frame = getattr(obj, "insider_transactions", None)
    if callable(frame):
        frame = frame()
    if frame is None:
        getter = getattr(obj, "get_insider_transactions", None)
        frame = getter() if callable(getter) else None
    if not isinstance(frame, pd.DataFrame):
        return []
    return parse_yahoo_insider_frame(
        frame,
        ticker=ticker,
        company=company,
    )


class InsiderService:
    def __init__(self) -> None:
        self._ticker_cache: dict[
            tuple[str, str],
            tuple[float, list[InsiderTrade]],
        ] = {}
        self._snapshot_cache: dict[
            tuple[str, str, int, int],
            tuple[float, InsiderSnapshot],
        ] = {}
        self._sec_ticker_map: dict[str, str] = {}
        self._sec_ticker_map_at = 0.0

    @staticmethod
    def sec_headers() -> dict[str, str]:
        return {
            "User-Agent": os.getenv(
                "SEC_USER_AGENT",
                "Anatole/0.5 https://github.com/sodia48/anatole",
            ),
            "Accept": (
                "application/json,application/xml,"
                "text/xml,text/html,*/*"
            ),
        }

    async def canadian_ticker(
        self,
        ticker: str,
        company: str,
        *,
        force_refresh: bool,
    ) -> list[InsiderTrade]:
        key = ("ca", ticker.upper())
        cached = self._ticker_cache.get(key)
        if (
            not force_refresh and cached
            and monotonic() - cached[0] < CACHE_SECONDS
        ):
            return cached[1]
        try:
            trades = await asyncio.wait_for(
                asyncio.to_thread(
                    fetch_yahoo_sync, ticker, company
                ),
                timeout=22,
            )
        except Exception:
            trades = cached[1] if cached else []
        self._ticker_cache[key] = (monotonic(), trades)
        return trades

    async def sec_ticker_map(
        self,
        client: httpx.AsyncClient,
    ) -> dict[str, str]:
        if (
            self._sec_ticker_map
            and monotonic() - self._sec_ticker_map_at < 86_400
        ):
            return self._sec_ticker_map
        response = await client.get(
            SEC_TICKERS_URL,
            headers=self.sec_headers(),
        )
        response.raise_for_status()
        mapping: dict[str, str] = {}
        for item in response.json().values():
            ticker = str(item.get("ticker") or "").upper()
            cik = str(item.get("cik_str") or "").zfill(10)
            if ticker and cik:
                mapping[ticker] = cik
        self._sec_ticker_map = mapping
        self._sec_ticker_map_at = monotonic()
        return mapping

    async def filing_xml(
        self,
        client: httpx.AsyncClient,
        *,
        cik: str,
        accession: str,
        primary_document: str,
    ) -> tuple[str, str]:
        compact = accession.replace("-", "")
        base = (
            "https://www.sec.gov/Archives/edgar/data/"
            f"{int(cik)}/{compact}/"
        )
        primary_url = urljoin(base, primary_document)
        response = await client.get(
            primary_url,
            headers=self.sec_headers(),
        )
        response.raise_for_status()
        if "<ownershipDocument" in response.text:
            return response.text, primary_url
        match = re.search(
            r'href=["\']([^"\']+\.xml)["\']',
            response.text,
            flags=re.I,
        )
        if match is None:
            return "", primary_url
        xml_url = urljoin(primary_url, match.group(1))
        xml_response = await client.get(
            xml_url,
            headers=self.sec_headers(),
        )
        xml_response.raise_for_status()
        return xml_response.text, xml_url

    async def us_ticker(
        self,
        ticker: str,
        *,
        days: int,
        limit: int,
    ) -> tuple[list[InsiderTrade], int]:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                REQUEST_TIMEOUT_SECONDS,
                connect=10,
            ),
            follow_redirects=True,
        ) as client:
            mapping = await self.sec_ticker_map(client)
            cik = mapping.get(ticker.upper())
            if cik is None:
                return [], 0
            response = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers=self.sec_headers(),
            )
            response.raise_for_status()
            recent = (
                response.json()
                .get("filings", {})
                .get("recent", {})
            )
            cutoff = date.today() - timedelta(days=days)
            filings: list[tuple[str, str]] = []
            for form, accession, document, filing_date in zip(
                recent.get("form", []),
                recent.get("accessionNumber", []),
                recent.get("primaryDocument", []),
                recent.get("filingDate", []),
                strict=False,
            ):
                if form not in {"4", "4/A"}:
                    continue
                parsed_date = safe_date(filing_date)
                if parsed_date is not None and parsed_date < cutoff:
                    continue
                filings.append((accession, document))
                if len(filings) >= limit:
                    break
            semaphore = asyncio.Semaphore(5)

            async def load(accession: str, document: str):
                async with semaphore:
                    try:
                        xml_document, source_url = await self.filing_xml(
                            client,
                            cik=cik,
                            accession=accession,
                            primary_document=document,
                        )
                        return parse_sec_ownership_xml(
                            xml_document,
                            source_url=source_url,
                        )
                    except Exception:
                        return []

            nested = await asyncio.gather(
                *[
                    load(accession, document)
                    for accession, document in filings
                ]
            )
        return [
            trade for group in nested for trade in group
        ], len(filings)

    async def us_radar(
        self,
        *,
        days: int,
        limit: int,
    ) -> tuple[list[InsiderTrade], int]:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                REQUEST_TIMEOUT_SECONDS,
                connect=10,
            ),
            follow_redirects=True,
        ) as client:
            response = await client.get(
                SEC_CURRENT_URL,
                params={
                    "action": "getcurrent",
                    "type": "4",
                    "owner": "include",
                    "count": str(min(limit * 2, 80)),
                    "output": "atom",
                },
                headers=self.sec_headers(),
            )
            response.raise_for_status()
            try:
                root = ElementTree.fromstring(response.text)
            except ElementTree.ParseError:
                return [], 0
            namespace = "{http://www.w3.org/2005/Atom}"
            entries = (
                root.findall(f"{namespace}entry")
                or root.findall("entry")
            )
            cutoff = date.today() - timedelta(days=days)
            urls: list[str] = []
            for entry in entries:
                updated_node = entry.find(f"{namespace}updated")
                if updated_node is None:
                    updated_node = entry.find("updated")
                updated = safe_date(
                    updated_node.text
                    if updated_node is not None else ""
                )
                if updated is not None and updated < cutoff:
                    continue
                link_node = entry.find(f"{namespace}link")
                if link_node is None:
                    link_node = entry.find("link")
                url = (
                    str(link_node.attrib.get("href") or "")
                    if link_node is not None else ""
                )
                if url:
                    urls.append(url)
                if len(urls) >= limit:
                    break
            semaphore = asyncio.Semaphore(5)

            async def load(url: str):
                async with semaphore:
                    try:
                        index_response = await client.get(
                            url,
                            headers=self.sec_headers(),
                        )
                        index_response.raise_for_status()
                        if "<ownershipDocument" in index_response.text:
                            return parse_sec_ownership_xml(
                                index_response.text,
                                source_url=url,
                            )
                        match = re.search(
                            r'href=["\']([^"\']+\.xml)["\']',
                            index_response.text,
                            flags=re.I,
                        )
                        if match is None:
                            return []
                        xml_url = urljoin(url, match.group(1))
                        xml_response = await client.get(
                            xml_url,
                            headers=self.sec_headers(),
                        )
                        xml_response.raise_for_status()
                        return parse_sec_ownership_xml(
                            xml_response.text,
                            source_url=xml_url,
                        )
                    except Exception:
                        return []

            nested = await asyncio.gather(
                *[load(url) for url in urls]
            )
        return [
            trade for group in nested for trade in group
        ], len(urls)

    async def snapshot(
        self,
        *,
        market: str,
        ticker: str | None,
        days: int,
        scan_limit: int,
        result_limit: int,
        force_refresh: bool = False,
    ) -> InsiderSnapshot:
        normalized_market = (
            "États-Unis"
            if market.lower() in {"us", "usa"}
            else "Canada"
        )
        clean_ticker = display_ticker(ticker) if ticker else ""
        cache_key = (
            normalized_market,
            clean_ticker,
            days,
            scan_limit,
        )
        cached = self._snapshot_cache.get(cache_key)
        if (
            not force_refresh and cached
            and monotonic() - cached[0] < CACHE_SECONDS
        ):
            return cached[1].model_copy(
                update={"trades": cached[1].trades[:result_limit]}
            )

        trades: list[InsiderTrade] = []
        sources: list[InsiderSourceStatus] = []
        scanned = 0

        if normalized_market == "Canada":
            directory = tsx60_directory()
            if clean_ticker:
                company = next(
                    (
                        name
                        for symbol, name in directory
                        if display_ticker(symbol) == clean_ticker
                    ),
                    clean_ticker,
                )
                trades = await self.canadian_ticker(
                    clean_ticker,
                    company,
                    force_refresh=force_refresh,
                )
                scanned = 1
            else:
                selected = directory[
                    :max(1, min(scan_limit, 24))
                ]
                semaphore = asyncio.Semaphore(4)

                async def load(symbol: str, company: str):
                    async with semaphore:
                        return await self.canadian_ticker(
                            display_ticker(symbol),
                            company,
                            force_refresh=force_refresh,
                        )

                nested = await asyncio.gather(
                    *[
                        load(symbol, company)
                        for symbol, company in selected
                    ]
                )
                trades = [
                    trade for group in nested for trade in group
                ]
                scanned = len(selected)
            sources.extend(
                [
                    InsiderSourceStatus(
                        source="Yahoo Finance",
                        status="available" if trades else "partial",
                        count=len(trades),
                        detail=(
                            "Source secondaire automatisée; "
                            "vérification officielle SEDI fournie."
                        ),
                        url="https://finance.yahoo.com/",
                    ),
                    InsiderSourceStatus(
                        source="SEDI",
                        status="available",
                        count=0,
                        detail="Registre officiel canadien de vérification.",
                        url=SEDI_URL,
                    ),
                ]
            )
        else:
            try:
                if clean_ticker:
                    trades, scanned = await self.us_ticker(
                        clean_ticker,
                        days=days,
                        limit=max(1, min(scan_limit, 25)),
                    )
                else:
                    trades, scanned = await self.us_radar(
                        days=days,
                        limit=max(1, min(scan_limit, 35)),
                    )
                sources.append(
                    InsiderSourceStatus(
                        source="SEC EDGAR",
                        status="available" if trades else "partial",
                        count=len(trades),
                        detail="Formulaires 4 et 4/A officiels.",
                        url="https://www.sec.gov/search-filings",
                    )
                )
            except Exception as exc:
                sources.append(
                    InsiderSourceStatus(
                        source="SEC EDGAR",
                        status="unavailable",
                        count=0,
                        detail=type(exc).__name__,
                        url="https://www.sec.gov/search-filings",
                    )
                )

        cutoff = date.today() - timedelta(days=days)
        filtered = [
            trade for trade in trades
            if trade.trade_date is None or trade.trade_date >= cutoff
        ]
        deduplicated = deduplicate_trades(filtered)
        full_snapshot = InsiderSnapshot(
            trades=deduplicated,
            summary=summarize_trades(deduplicated),
            sources=sources,
            market=normalized_market,
            requested_ticker=clean_ticker or None,
            scanned_symbols=scanned,
            generated_at=datetime.now(UTC),
            message=(
                None
                if deduplicated
                else (
                    "Aucune transaction normalisée détectée. "
                    "Cela ne signifie pas qu’aucune déclaration "
                    "officielle n’existe."
                )
            ),
        )
        self._snapshot_cache[cache_key] = (
            monotonic(),
            full_snapshot,
        )
        return full_snapshot.model_copy(
            update={"trades": full_snapshot.trades[:result_limit]}
        )


insider_service = InsiderService()
