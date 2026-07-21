from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime
from time import monotonic
from typing import Any, Literal

import httpx

from app.schemas.fundamentals import (
    FinancialPeriod,
    FinancialSource,
)


SEC_TICKERS_URL = (
    "https://www.sec.gov/files/company_tickers_exchange.json"
)
SEC_FACTS_URL = (
    "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
)

ANNUAL_FORMS = {
    "10-K",
    "10-K/A",
    "20-F",
    "20-F/A",
    "40-F",
    "40-F/A",
}
QUARTERLY_FORMS = {
    "10-Q",
    "10-Q/A",
    "6-K",
    "6-K/A",
}

# Cas où le symbole américain diffère du symbole TSX.
SEC_TICKER_ALIASES = {
    "CNR": "CNI",
    "MG": "MGA",
    "RCI.B": "RCI",
    "TECK.B": "TECK",
    "BIP.UN": "BIP",
    "BEP.UN": "BEP",
    "GIB.A": "GIB",
    "QBR.B": "QBCRF",
    "T": "TU",
    "CCO": "CCJ",
}


DURATION_CONCEPTS: dict[str, tuple[str, ...]] = {
    "total_revenue": (
        "Revenue",
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractsWithCustomers",
        "SalesRevenueNet",
    ),
    "cost_of_revenue": (
        "CostOfRevenue",
        "CostOfGoodsAndServicesSold",
        "CostOfSales",
    ),
    "gross_profit": ("GrossProfit",),
    "research_development": (
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
    ),
    "selling_general_administrative": (
        "SellingGeneralAndAdministrativeExpense",
        "GeneralAndAdministrativeExpense",
    ),
    "total_operating_expenses": (
        "OperatingExpenses",
        "CostsAndExpenses",
    ),
    "operating_income": (
        "OperatingIncomeLoss",
        "ProfitLossFromOperatingActivities",
    ),
    "ebit": (
        "EarningsBeforeInterestAndTaxes",
        "ProfitLossFromOperatingActivities",
    ),
    "interest_expense": (
        "InterestExpenseNonOperating",
        "FinanceCosts",
    ),
    "income_before_tax": (
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "ProfitLossBeforeTax",
    ),
    "income_tax_expense": (
        "IncomeTaxExpenseBenefit",
        "IncomeTaxExpenseContinuingOperations",
    ),
    "net_income": (
        "NetIncomeLoss",
        "ProfitLoss",
        "ProfitLossAttributableToOwnersOfParent",
    ),
    "basic_eps": (
        "EarningsPerShareBasic",
        "BasicEarningsLossPerShare",
    ),
    "diluted_eps": (
        "EarningsPerShareDiluted",
        "DilutedEarningsLossPerShare",
    ),
    "diluted_average_shares": (
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "AdjustedWeightedAverageShares",
    ),
    "depreciation_amortization": (
        "DepreciationDepletionAndAmortization",
        "DepreciationAndAmortization",
    ),
    "operating_cash_flow": (
        "NetCashProvidedByUsedInOperatingActivities",
        "CashFlowsFromUsedInOperatingActivities",
    ),
    "capital_expenditure": (
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PurchaseOfPropertyPlantAndEquipment",
    ),
    "dividends_paid": (
        "PaymentsOfDividends",
        "PaymentsOfDividendsCommonStock",
        "DividendsPaid",
    ),
    "share_repurchases": (
        "PaymentsForRepurchaseOfCommonStock",
        "PurchaseOfTreasuryShares",
    ),
}

INSTANT_CONCEPTS: dict[str, tuple[str, ...]] = {
    "total_cash": (
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        "CashAndCashEquivalents",
    ),
    "current_assets": (
        "AssetsCurrent",
        "CurrentAssets",
    ),
    "current_liabilities": (
        "LiabilitiesCurrent",
        "CurrentLiabilities",
    ),
    "total_assets": ("Assets",),
    "total_liabilities": (
        "Liabilities",
        "LiabilitiesAndStockholdersEquity",
    ),
    "stockholder_equity": (
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        "Equity",
        "EquityAttributableToOwnersOfParent",
    ),
    "_total_debt_direct": (
        "LongTermDebtAndFinanceLeaseObligations",
        "Borrowings",
    ),
    "_short_term_debt": (
        "ShortTermBorrowings",
        "LongTermDebtCurrent",
        "LongTermDebtAndFinanceLeaseObligationsCurrent",
        "BorrowingsCurrent",
        "CurrentBorrowings",
    ),
    "_long_term_debt": (
        "LongTermDebtNoncurrent",
        "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
        "BorrowingsNoncurrent",
        "NoncurrentBorrowings",
    ),
}


@dataclass(slots=True)
class SECEdgarResult:
    cik: str
    entity_name: str
    annual: list[FinancialPeriod]
    quarterly: list[FinancialPeriod]


class SECEdgarFinancialsProvider:
    ticker_cache_ttl = 86_400
    facts_cache_ttl = 3_600

    def __init__(self) -> None:
        self._ticker_cache: tuple[
            float,
            dict[str, tuple[str, str]],
        ] | None = None
        self._facts_cache: dict[
            str,
            tuple[float, dict[str, Any]],
        ] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    @property
    def headers(self) -> dict[str, str]:
        user_agent = os.getenv(
            "SEC_USER_AGENT",
            "Anatole official-financials "
            "contact@anatole.app",
        )
        return {
            "User-Agent": user_agent,
            "Accept-Encoding": "gzip, deflate",
            "Host": "data.sec.gov",
        }

    def _lock_for(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    @staticmethod
    def normalize_ticker(ticker: str) -> str:
        value = (
            ticker.strip()
            .upper()
            .removesuffix(".TO")
            .replace("-", ".")
        )
        return SEC_TICKER_ALIASES.get(value, value)

    async def _ticker_map(
        self,
    ) -> dict[str, tuple[str, str]]:
        now = monotonic()
        if (
            self._ticker_cache is not None
            and now - self._ticker_cache[0]
            < self.ticker_cache_ttl
        ):
            return self._ticker_cache[1]

        headers = dict(self.headers)
        headers["Host"] = "www.sec.gov"

        async with httpx.AsyncClient(
            headers=headers,
            timeout=20.0,
            follow_redirects=True,
        ) as client:
            response = await client.get(SEC_TICKERS_URL)
            response.raise_for_status()
            payload = response.json()

        fields = payload.get("fields") or []
        rows = payload.get("data") or []
        indexes = {
            str(field): index
            for index, field in enumerate(fields)
        }
        output: dict[str, tuple[str, str]] = {}

        for row in rows:
            if not isinstance(row, list):
                continue
            try:
                ticker = str(row[indexes["ticker"]]).upper()
                cik = str(row[indexes["cik"]]).zfill(10)
                name = str(row[indexes["name"]])
            except (KeyError, IndexError):
                continue

            output[ticker] = (cik, name)

        self._ticker_cache = (monotonic(), output)
        return output

    async def resolve_cik(
        self,
        ticker: str,
    ) -> tuple[str, str] | None:
        mapping = await self._ticker_map()
        return mapping.get(self.normalize_ticker(ticker))

    async def _company_facts(
        self,
        cik: str,
    ) -> dict[str, Any]:
        cached = self._facts_cache.get(cik)
        now = monotonic()

        if (
            cached is not None
            and now - cached[0] < self.facts_cache_ttl
        ):
            return cached[1]

        async with self._lock_for(cik):
            cached = self._facts_cache.get(cik)
            now = monotonic()

            if (
                cached is not None
                and now - cached[0] < self.facts_cache_ttl
            ):
                return cached[1]

            async with httpx.AsyncClient(
                headers=self.headers,
                timeout=25.0,
                follow_redirects=True,
            ) as client:
                response = await client.get(
                    SEC_FACTS_URL.format(cik=cik)
                )
                response.raise_for_status()
                payload = response.json()

            self._facts_cache[cik] = (monotonic(), payload)
            return payload

    @staticmethod
    def _date(value: Any) -> date | None:
        if not value:
            return None
        try:
            return date.fromisoformat(str(value))
        except ValueError:
            return None

    @staticmethod
    def _datetime(value: Any) -> datetime | None:
        parsed = SECEdgarFinancialsProvider._date(value)
        if parsed is None:
            return None
        return datetime(
            parsed.year,
            parsed.month,
            parsed.day,
            tzinfo=UTC,
        )

    @staticmethod
    def _number(value: Any) -> float | None:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None
        return parsed if parsed == parsed else None

    @staticmethod
    def _form_period(
        fact: dict[str, Any],
        *,
        duration: bool,
    ) -> Literal["annual", "quarterly"] | None:
        form = str(fact.get("form") or "").upper()
        start = SECEdgarFinancialsProvider._date(
            fact.get("start")
        )
        end = SECEdgarFinancialsProvider._date(
            fact.get("end")
        )

        if form in ANNUAL_FORMS:
            return "annual"

        if form not in QUARTERLY_FORMS:
            return None

        if not duration:
            return "quarterly"

        if start is None or end is None:
            return None

        days = (end - start).days
        if 55 <= days <= 125:
            return "quarterly"

        # Les 6-K IFRS peuvent contenir des cumuls de six ou neuf mois.
        # Ces valeurs ne sont pas traitées comme un trimestre autonome.
        return None

    @staticmethod
    def _source_url(
        cik: str,
        accession: str,
    ) -> str:
        cik_number = str(int(cik))
        accession_clean = accession.replace("-", "")
        return (
            "https://www.sec.gov/Archives/edgar/data/"
            f"{cik_number}/{accession_clean}/"
            f"{accession}-index.html"
        )

    @staticmethod
    def _units_for_concept(
        payload: dict[str, Any],
        tags: tuple[str, ...],
    ) -> list[tuple[str, dict[str, Any]]]:
        output: list[tuple[str, dict[str, Any]]] = []
        facts = payload.get("facts") or {}

        for taxonomy in ("ifrs-full", "us-gaap"):
            namespace = facts.get(taxonomy) or {}
            for tag in tags:
                concept = namespace.get(tag)
                if not isinstance(concept, dict):
                    continue
                units = concept.get("units") or {}
                for unit, entries in units.items():
                    if not isinstance(entries, list):
                        continue
                    for entry in entries:
                        if isinstance(entry, dict):
                            output.append((str(unit), entry))
        return output

    @staticmethod
    def _preferred_currency(
        candidates: list[tuple[str, dict[str, Any]]],
    ) -> str | None:
        counts: dict[str, int] = {}
        for unit, entry in candidates:
            if "/shares" in unit.lower():
                continue
            if entry.get("form") not in ANNUAL_FORMS | QUARTERLY_FORMS:
                continue
            counts[unit] = counts.get(unit, 0) + 1

        if not counts:
            return None

        return max(counts, key=counts.get)

    def _periods(
        self,
        payload: dict[str, Any],
        cik: str,
        period_type: Literal["annual", "quarterly"],
    ) -> list[FinancialPeriod]:
        revenue_candidates = self._units_for_concept(
            payload,
            DURATION_CONCEPTS["total_revenue"],
        )
        preferred_currency = self._preferred_currency(
            revenue_candidates
        )

        rows: dict[date, dict[str, Any]] = {}
        filed_dates: dict[date, date] = {}

        def accept_unit(field: str, unit: str) -> bool:
            lowered = unit.lower()
            if field in {
                "basic_eps",
                "diluted_eps",
            }:
                return "share" in lowered
            if field == "diluted_average_shares":
                return unit == "shares"
            if preferred_currency is None:
                return True
            return unit == preferred_currency

        for field, tags in DURATION_CONCEPTS.items():
            for unit, fact in self._units_for_concept(
                payload,
                tags,
            ):
                if not accept_unit(field, unit):
                    continue
                if (
                    self._form_period(
                        fact,
                        duration=True,
                    )
                    != period_type
                ):
                    continue

                end = self._date(fact.get("end"))
                filed = self._date(fact.get("filed"))
                value = self._number(fact.get("val"))

                if end is None or value is None:
                    continue

                row = rows.setdefault(
                    end,
                    {
                        "period_end": self._datetime(end),
                        "period_type": period_type,
                        "currency": preferred_currency,
                    },
                )

                # La version la plus récemment déposée remplace une
                # valeur antérieure du même exercice.
                if (
                    field not in row
                    or filed is not None
                    and filed > filed_dates.get(
                        end,
                        date.min,
                    )
                ):
                    if field in {
                        "capital_expenditure",
                        "dividends_paid",
                        "share_repurchases",
                    }:
                        value = -abs(value)

                    row[field] = value
                    filed_dates[end] = filed or date.min
                    accession = str(fact.get("accn") or "")
                    row["source"] = FinancialSource(
                        source_type="sec_edgar_xbrl",
                        source_name=(
                            "SEC EDGAR CompanyFacts XBRL"
                        ),
                        source_url=(
                            self._source_url(
                                cik,
                                accession,
                            )
                            if accession
                            else None
                        ),
                        filed_at=(
                            self._datetime(filed)
                            if filed is not None
                            else None
                        ),
                        form=str(
                            fact.get("form") or ""
                        )
                        or None,
                        confidence="official",
                    )

        # Remplissage du bilan sur les mêmes dates de clôture.
        for field, tags in INSTANT_CONCEPTS.items():
            for unit, fact in self._units_for_concept(
                payload,
                tags,
            ):
                if (
                    preferred_currency is not None
                    and unit != preferred_currency
                ):
                    continue
                if (
                    self._form_period(
                        fact,
                        duration=False,
                    )
                    != period_type
                ):
                    continue

                end = self._date(fact.get("end"))
                value = self._number(fact.get("val"))

                if (
                    end is None
                    or value is None
                    or end not in rows
                ):
                    continue

                rows[end][field] = value

        output: list[FinancialPeriod] = []

        for _, row in sorted(
            rows.items(),
            key=lambda pair: pair[0],
            reverse=True,
        ):
            direct_debt = row.pop(
                "_total_debt_direct",
                None,
            )
            short_debt = row.pop(
                "_short_term_debt",
                None,
            )
            long_debt = row.pop(
                "_long_term_debt",
                None,
            )
            total_debt = direct_debt

            if total_debt is None and (
                short_debt is not None
                or long_debt is not None
            ):
                total_debt = (
                    (short_debt or 0)
                    + (long_debt or 0)
                )

            row["total_debt"] = total_debt
            cash = row.get("total_cash")
            row["net_debt"] = (
                total_debt - cash
                if total_debt is not None
                and cash is not None
                else None
            )

            revenue = row.get("total_revenue")
            operating_cash_flow = row.get(
                "operating_cash_flow"
            )
            capex = row.get("capital_expenditure")
            if (
                row.get("free_cash_flow") is None
                and operating_cash_flow is not None
                and capex is not None
            ):
                row["free_cash_flow"] = (
                    operating_cash_flow + capex
                )

            output.append(FinancialPeriod(**row))

        limit = 5 if period_type == "annual" else 12
        return output[:limit]

    async def get_financials(
        self,
        ticker: str,
    ) -> SECEdgarResult | None:
        resolved = await self.resolve_cik(ticker)
        if resolved is None:
            return None

        cik, entity_name = resolved
        payload = await self._company_facts(cik)

        annual = self._periods(
            payload,
            cik,
            "annual",
        )
        quarterly = self._periods(
            payload,
            cik,
            "quarterly",
        )

        if not annual and not quarterly:
            return None

        return SECEdgarResult(
            cik=cik,
            entity_name=entity_name,
            annual=annual,
            quarterly=quarterly,
        )


sec_edgar_financials_provider = (
    SECEdgarFinancialsProvider()
)
