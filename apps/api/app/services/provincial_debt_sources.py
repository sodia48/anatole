"""Verified official issuer directory; missing fields are deliberately null."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime


from app.services.debt_profile_parsing import Document, dated, fiscal, number, official_html
from app.schemas.fixed_income import DebtFieldSource, FixedIncomeDataQuality, GovernmentBondIssue, ProvincialDebtProfile


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

QC_PROGRAM_URL = "https://www.finances.gouv.qc.ca/ministere/financement/relations_investisseurs/programme_financement_gouvernement.asp"
NL_URL = "https://investorrelations.gov.nl.ca/"
PROFILE_URLS = {code: PROVINCES[code][2] for code in PROVINCES}
PROFILE_URLS.update(QC=QC_PROGRAM_URL, ON=VERIFIED_ON, NL=NL_URL)
PARSER_CODES = {"QC", "ON", "AB", "SK", "NB", "NL"}


def _plan(amount: float | None, year: str | None, description: str,
          observed_at: datetime | None = None) -> dict | None:
    if amount is None or amount <= 0 or year is None:
        return None
    return {"borrowing_program_amount": amount, "fiscal_year": year,
            "observed_at": observed_at, "description": description}


def parse_quebec_borrowing(html: str) -> dict | None:
    doc = Document(html)
    # The date belongs to the financing-program section, not another chart on the page.
    section = doc.text.split("Diversification selon les marchés")[0]
    stamp = re.search(r"Note\s*:?[ ]*Au (\d{1,2} [a-zéû]+ 20\d{2}),", section, re.I)
    observed = dated(stamp[1]) if stamp else None
    if not observed or "Programme de financement du gouvernement" not in section:
        return None
    start = observed.year - (observed.month < 4)
    year = f"{start}-{start + 1}"
    for table in doc.tables:
        if not table or table[0] != ["Année financière", "M$"]:
            continue
        for row in table[1:]:
            if len(row) == 2 and row[0] == year:
                value = number(row[1], french=True)
                return _plan(value * 1e6 if value is not None else None, fiscal(year),
                             "Programme de financement du gouvernement (M$ CAD)", observed)
    return None


def parse_ontario_borrowing(html: str) -> tuple[float | None, str | None]:
    doc = Document(html)
    section = doc.text.split("Domestic and International Borrowing")[0]
    year = re.search(r"Ontario.s (20\d{2}[–-]\d{2}) Borrowing Program", section)
    match = re.search(r"Total Long-Term Public Borrowing\s*:?[ ]*\$\s*(\d+(?:\.\d+)?)B\b", section)
    if not year or not match:
        return None, None
    value = number(match[1])
    return (value * 1e9 if value is not None else None), fiscal(year[1])


def parse_alberta_borrowing(html: str) -> dict | None:
    doc = Document(html)
    for table in doc.tables:
        if not table or not table[0] or table[0][0] != "Borrowing requirements (CAD millions)":
            continue
        headers = table[0]
        # Select the latest explicitly labelled current-year forecast, not a future target.
        first = re.fullmatch(r"(20\d{2}-\d{2}) Target", headers[1]) if len(headers) > 1 else None
        if not first:
            continue
        index = 1
        for i, heading in enumerate(headers[2:], 2):
            if re.fullmatch(rf"{re.escape(first[1])} Q[1-4] Forecast", heading):
                index = i
        for row in table[1:]:
            if len(row) == len(headers) and row[0] == "Total borrowing requirements":
                value = number(row[index])
                return _plan(value * 1e6 if value is not None else None, fiscal(first[1]),
                             f"Total borrowing requirements, {headers[index]} (CAD millions)")
    return None


def parse_saskatchewan_borrowing(html: str) -> dict | None:
    # This is the official accessible description of the borrowing-requirements chart.
    text = Document(html).text
    match = re.search(r"Total borrowing requirements forecast as per (20\d{2}-\d{2}) Budget is \$([\d,]+(?:\.\d+)?) million", text)
    if not match:
        return None
    value = number(match[2])
    return _plan(value * 1e6 if value is not None else None, fiscal(match[1]),
                 "Total borrowing requirements, budget (term and short-term, CAD millions)")


def parse_new_brunswick_borrowing(html: str) -> dict | None:
    doc = Document(html)
    section = doc.text.split("Recent public issues")[0]
    stamp = re.search(r"As of ([A-Z][a-z]+ \d{1,2}, 20\d{2})", section)
    for table in doc.tables:
        if not table or len(table[0]) != 4:
            continue
        header = re.fullmatch(r"Fiscal Year [–-] (20\d{2}/\d{2}) Total \(million\)", table[0][1])
        if not header:
            continue
        for row in table[1:]:
            if len(row) == 4 and row[0] == "Long Term Borrowing":
                value = number(row[1])
                return _plan(value * 1e6 if value is not None else None, fiscal(header[1]),
                             "Provincial long-term borrowing (excludes NB Power and municipal corporation)",
                             dated(stamp[1]) if stamp else None)
    return None


def parse_newfoundland_borrowing(html: str) -> dict | None:
    text = Document(html).text
    match = re.search(r"(20\d{2}-\d{2}) Borrowing Program Borrowing Requirement as of Budget (20\d{2}) \$(\d+(?:\.\d+)?) billion", text)
    if not match or match[1][:4] != match[2]:
        return None
    section = text[match.end():match.end() + 150]
    stamp = re.match(r" Borrowed as of ([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?, 20\d{2})", section)
    value = number(match[3])
    return _plan(value * 1e9 if value is not None else None, fiscal(match[1]),
                 "Borrowing requirement as of provincial budget", dated(stamp[1]) if stamp else None)


def parse_new_brunswick_issues(html: str) -> list[GovernmentBondIssue]:
    rows = []
    for table in Document(html).tables:
        if not table or table[0] != ["Settlement Date", "Series", "Security Issued", "Par Amount", "Currency", "ISIN / CUSIP", "Offering Circular"]:
            continue
        for row in table[1:]:
            if len(row) != 7 or row[4] not in {"CAD", "USD", "EUR", "CHF"}:
                continue
            security = re.fullmatch(r"(\d+(?:\.\d+)?)% of ([A-Z][a-z]+ \d{1,2}, 20\d{2})", row[2])
            amount = re.fullmatch(r"(\d+(?:\.\d+)?) (million|billion)", row[3])
            identifiers = re.fullmatch(r"([A-Z0-9]{12}) / ([A-Z0-9]{9})", row[5])
            if not security or not amount or not identifiers:
                continue
            settled, maturity = dated(row[0]), dated(security[2])
            value, coupon = number(amount[1]), number(security[1])
            if not settled or not maturity or settled >= maturity or settled > datetime.now(UTC):
                continue  # Reject the source's malformed future settlement, never repair it by guessing.
            if value is None or value <= 0 or coupon is None or coupon > 25:
                continue
            rows.append(GovernmentBondIssue(issuer_level="provincial", issuer="Province of New Brunswick",
                jurisdiction="NB", settlement_date=settled.date(), maturity_date=maturity.date(),
                coupon_percent=coupon, issue_amount=value * (1e6 if amount[2] == "million" else 1e9),
                currency=row[4], isin=identifiers[1], cusip=identifiers[2],
                official_url=PROFILE_URLS["NB"], observed_at=settled))
    return sorted(rows, key=lambda row: row.settlement_date, reverse=True)[:30]


def parse_newfoundland_issue(html: str) -> list[GovernmentBondIssue]:
    text = Document(html).text
    if "Most Recent Bond Issue" not in text:
        return []
    section = text.split("Most Recent Bond Issue", 1)[1][:600]
    match = re.match(r"\s+Bond Type: Domestic Series: ([A-Z0-9]{1,8}) Date Issued: ([A-Z][a-z]+ \d{1,2}, 20\d{2}) Coupon: (\d+(?:\.\d+)?)% Yield: (\d+(?:\.\d+)?)% Date of Maturity: ([A-Z][a-z]+ \d{1,2}, 20\d{2}) Amount: (\d+(?:\.\d+)?) million Currency: (CAD|USD)\b", section)
    if not match:
        return []
    issued, maturity = dated(match[2]), dated(match[5])
    coupon, published_yield, amount = number(match[3]), number(match[4]), number(match[6])
    if not issued or not maturity or maturity <= issued or coupon is None or published_yield is None or amount is None:
        return []
    if not (0 <= coupon <= 25 and 0 <= published_yield <= 25 and 0 < amount <= 100_000):
        return []
    return [GovernmentBondIssue(issuer_level="provincial", issuer="Province of Newfoundland and Labrador",
        jurisdiction="NL", issue_date=issued.date(), maturity_date=maturity.date(), coupon_percent=coupon,
        yield_percent=published_yield, yield_source=NL_URL, issue_amount=amount * 1e6,
        currency=match[7], official_url=NL_URL, observed_at=issued)]


def parse_newfoundland_debt(html: str) -> dict | None:
    doc = Document(html)
    section = doc.text.split("Gross Debentures and Treasury Bills Outstanding:")[0]
    stamp = re.search(r"Debt Portfolio\s*1?\s*As of ([A-Z][a-z]+ \d{1,2}, 20\d{2})", section)
    observed = dated(stamp[1]) if stamp else None
    if not observed:
        return None
    for table in doc.tables:
        if not any("$ (millions)" in row for row in table):
            continue
        for row in table:
            if len(row) >= 2 and row[0] == "Gross Debentures and Treasury Bills Outstanding:":
                value = number(row[1])
                if value is not None:
                    return {"debt_outstanding": value * 1e6, "observed_at": observed,
                            "description": "Gross debentures and Treasury bills; excludes government enterprises, agencies and boards"}
    return None


async def provincial_profile(code: str) -> ProvincialDebtProfile | None:
    code = code.upper()
    if code not in PROVINCES:
        return None
    name, issuer, investor_url, _ = PROVINCES[code]
    url = PROFILE_URLS[code]
    debt_url = PROVINCES["NL"][2]
    if code == "NL":
        html, debt_html = await asyncio.gather(official_html(url), official_html(debt_url))
    else:
        html, debt_html = await official_html(url), None
    debt = parse_newfoundland_debt(debt_html) if debt_html else None
    plan = None
    recent_issues = []
    if html is not None:
        parsers = {"QC": parse_quebec_borrowing, "AB": parse_alberta_borrowing,
                   "SK": parse_saskatchewan_borrowing, "NB": parse_new_brunswick_borrowing,
                   "NL": parse_newfoundland_borrowing}
        if code == "ON":
            amount, year = parse_ontario_borrowing(html)
            plan = _plan(amount, year, "Total long-term public borrowing, current outlook (CAD billions)")
        elif code in parsers:
            plan = parsers[code](html)
        if code == "NL":
            recent_issues = parse_newfoundland_issue(html)
        elif code == "NB":
            recent_issues = parse_new_brunswick_issues(html)
    coverage = "partial" if plan or recent_issues or debt else "limited" if html is not None or debt_html is not None else "unavailable"
    observed = plan["observed_at"] if plan else None
    sources = {}
    if plan:
        sources["borrowing_program_amount"] = DebtFieldSource(official_url=url,
            observed_at=observed, description=plan["description"])
    if recent_issues:
        sources["recent_issues"] = DebtFieldSource(official_url=url,
            observed_at=recent_issues[0].observed_at, description="Official published issues; any explicit yield is at issuance")
        observed = observed or recent_issues[0].observed_at
    if debt:
        sources["debt_outstanding"] = DebtFieldSource(official_url=debt_url,
            observed_at=debt["observed_at"], description=debt["description"])
        observed = observed or debt["observed_at"]
    return ProvincialDebtProfile(code=code, name=name, issuer=issuer,
        investor_relations_url=investor_url, borrowing_program_url=url if code in PARSER_CODES else None,
        debt_management_url=investor_url, parser_support=code in PARSER_CODES,
        last_verified=datetime.now(UTC).date() if html is not None else None,
        coverage=coverage, borrowing_program_amount=plan["borrowing_program_amount"] if plan else None,
        fiscal_year=plan["fiscal_year"] if plan else None, recent_issues=recent_issues,
        debt_outstanding=debt["debt_outstanding"] if debt else None,
        last_updated=observed, source_urls=list(dict.fromkeys([url, investor_url])), field_sources=sources,
        quality=FixedIncomeDataQuality(scope="province_profiles", status=coverage, source=url,
            observed_at=observed, freshness="delayed" if observed else "unavailable",
            coverage=plan["description"] if plan else "Official issue" if recent_issues else
            "Official source only" if html is not None else "Official source temporarily inaccessible"))
