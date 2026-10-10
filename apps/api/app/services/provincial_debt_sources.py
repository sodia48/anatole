"""Verified official issuer directory; missing fields are deliberately null."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from html.parser import HTMLParser

from app.core.resilience import shared_http_client
from app.schemas.fixed_income import FixedIncomeDataQuality, ProvincialDebtProfile


VERIFIED_ON = "https://www.ofina.on.ca/borrowing_debt/borrowing.htm"
VERIFIED_QC = "https://www.finances.gouv.qc.ca/investor_relations/"
PROVINCES = {
    "QC": ("Québec", "Gouvernement du Québec", VERIFIED_QC, "https://www.finances.gouv.qc.ca/investor_relations/quebec_borrowings.asp"),
    "ON": ("Ontario", "Province of Ontario", "https://www.ofina.on.ca/main.html", VERIFIED_ON),
    "BC": ("British Columbia", "Province of British Columbia", "https://www2.gov.bc.ca/gov/content/governments/finances/debt/reports-publications", None),
    "AB": ("Alberta", "Province of Alberta", "https://www.alberta.ca/investor-relations", None),
    "SK": ("Saskatchewan", "Province of Saskatchewan", "https://www.saskatchewan.ca/Government/Budget-Planning-and-Reporting/Investor-Relations", None),
    "MB": ("Manitoba", "Province of Manitoba", "https://www.gov.mb.ca/investor/index.html", None),
    "NB": ("New Brunswick", "Province of New Brunswick", "https://www.gnb.ca/en/topic/your-gov/budget-finance/investor-relations.html", None),
    "NS": ("Nova Scotia", "Province of Nova Scotia", "https://www.novascotia.ca/programs-and-services/investor-relations", None),
    "PE": ("Prince Edward Island", "Province of Prince Edward Island", "https://www.princeedwardisland.ca/en/information/finance-and-affordability/debt-management", None),
    "NL": ("Newfoundland and Labrador", "Province of Newfoundland and Labrador", "https://investorrelations.gov.nl.ca/debtportfolio.aspx", None),
    "YT": ("Yukon", "Government of Yukon", "https://yukon.ca/en/news/yukon-government-introduces-new-debt-management-policy/", None),
    "NT": ("Northwest Territories", "Government of the Northwest Territories", "https://www.fin.gov.nt.ca/en/services/public-accounts", None),
    "NU": ("Nunavut", "Government of Nunavut", "https://www.gov.nu.ca/en/department-finance/budget-2025-26", None),
}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def parse_ontario_borrowing(html: str) -> tuple[float | None, str | None]:
    """Read the explicitly labelled plan, never the similarly named total borrowed."""
    if len(html) > 1_000_000:
        return None, None
    parser = _Text()
    parser.feed(html)
    text = " ".join(" ".join(parser.parts).split())
    year = re.search(r"Ontario.s (20\d\d)[–-](\d\d) Borrowing Program", text)
    match = re.search(r"Total Long-Term Public Borrowing.{0,100}?\$\s*([\d,.]+)\s*B", text, re.I)
    if not year or not match:
        return None, None
    return float(match.group(1).replace(",", "")) * 1_000_000_000, f"{year.group(1)}-{year.group(2)}"


async def provincial_profile(code: str) -> ProvincialDebtProfile | None:
    code = code.upper()
    if code not in PROVINCES:
        return None
    name, issuer, investor_url, borrowing_url = PROVINCES[code]
    now = datetime.now(UTC)
    verified = bool(investor_url or borrowing_url)
    amount = None
    fiscal_year = None
    if code == "ON":
        try:
            response = await shared_http_client.request("GET", VERIFIED_ON, attempts=1)
            response.raise_for_status()
            amount, fiscal_year = parse_ontario_borrowing(response.text)
        except Exception:
            pass
    coverage = "partial" if amount is not None else "limited" if verified else "unavailable"
    source_urls = [url for url in (investor_url, borrowing_url) if url]
    return ProvincialDebtProfile(
        code=code, name=name, issuer=issuer,
        investor_relations_url=investor_url,
        debt_management_url=("https://www.ofina.on.ca/borrowing_debt/debt.htm" if code == "ON" else investor_url),
        borrowing_program_url=borrowing_url,
        parser_support=code == "ON",
        last_verified=date(2026, 10, 9) if verified else None,
        coverage=coverage, borrowing_program_amount=amount, fiscal_year=fiscal_year,
        green_social_sustainable_program=("Ontario Sustainable Bonds" if code == "ON" else None),
        last_updated=now if amount is not None else None, source_urls=source_urls,
        quality=FixedIncomeDataQuality(
            scope="province_profiles", status=coverage, source=borrowing_url,
            observed_at=now if amount is not None else None,
            freshness="delayed" if amount is not None else "unavailable",
            coverage="Official borrowing plan" if amount is not None else "Official issuer links only" if verified else "No verified parser",
        ),
    )
