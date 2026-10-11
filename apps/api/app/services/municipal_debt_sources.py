"""Allowlisted official municipal debt sources with bounded table parsing."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from html.parser import HTMLParser

from app.core.data_hub import shared_data_hub
from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.fixed_income import FixedIncomeDataQuality, GovernmentBondIssue, MunicipalDebtProfile
from app.schemas.fixed_income import DebtFieldSource
from app.services.debt_profile_parsing import Document, dated, number, official_html


TORONTO_ISSUES_URL = "https://www.toronto.ca/city-government/budget-finances/city-finance/investor-relations/recently-settled-bond-issues/"
TORONTO_INVESTOR_URL = "https://www.toronto.ca/city-government/budget-finances/city-finance/investor-relations/"
MONTREAL_URL = "https://montreal.ca/sujets/politiques-financieres"
MUNICIPALITIES = {
    "toronto": ("Toronto", "ON", TORONTO_INVESTOR_URL),
    "montreal": ("Montréal", "QC", MONTREAL_URL),
    "vancouver": ("Vancouver", "BC", "https://vancouver.ca/your-government/investor-relations.aspx"),
    "calgary": ("Calgary", "AB", "https://www.calgary.ca/our-finances/investor-relations.html"),
    "edmonton": ("Edmonton", "AB", "https://www.edmonton.ca/city_government/budget_finances/financial-reports"),
    "ottawa": ("Ottawa", "ON", "https://ottawa.ca/en/investor-relations/city-ottawa-debenture-activity"),
    "winnipeg": ("Winnipeg", "MB", "https://www.winnipeg.ca/city-governance/strategic-plans-policies"),
    "quebec": ("Québec", "QC", "https://www.ville.quebec.qc.ca/apropos/profil-financier/investisseurs/programme-financement.aspx"),
    "halifax": ("Halifax", "NS", "https://www.halifax.ca/sites/default/files/documents/city-hall/budget-finances/final-2025-26-budget-business-plan.pdf"),
}


class _Table(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []

    def handle_data(self, data: str) -> None:
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self.cell is not None and self.row is not None:
            self.row.append(" ".join(" ".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def _amount(raw: str) -> float | None:
    match = re.fullmatch(r"\$?\s*([\d,.]+)\s*(million|billion)", raw, re.I)
    if not match:
        return None
    value = number(match.group(1))
    return value * (1_000_000_000 if match.group(2).lower() == "billion" else 1_000_000) if value is not None else None


def parse_toronto_issues(html: str) -> list[GovernmentBondIssue]:
    if len(html) > 1_000_000:
        return []
    parser = _Table()
    parser.feed(html)
    result: list[GovernmentBondIssue] = []
    for row in parser.rows:
        if len(row) != 7:
            continue
        settled, coupon, maturity, currency, amount, cusip, outstanding = row
        try:
            settled_date = datetime.strptime(settled, "%B %d, %Y").date()
            maturity_date = datetime.strptime(maturity.removesuffix(" (reopening)"), "%B %d, %Y").date()
            coupon_percent = float(coupon.removesuffix("%"))
        except ValueError:
            continue
        if not re.fullmatch(r"[A-Z0-9]{9}", cusip) or currency not in {"CAD", "USD"}:
            continue
        if not 0 <= coupon_percent <= 25 or maturity_date <= settled_date or _amount(amount) is None:
            continue
        result.append(GovernmentBondIssue(
            issuer_level="municipal", issuer="City of Toronto", jurisdiction="ON", city="Toronto",
            cusip=cusip, settlement_date=settled_date, maturity_date=maturity_date,
            coupon_percent=coupon_percent, issue_amount=_amount(amount), currency=currency,
            outstanding_amount=_amount(outstanding), official_url=TORONTO_ISSUES_URL,
            observed_at=datetime.combine(settled_date, datetime.min.time(), UTC),
        ))
    return sorted(result, key=lambda row: row.settlement_date, reverse=True)[:30]


def parse_vancouver_programs(html: str) -> list[str]:
    text = Document(html).text
    return [name for name in ("Green Bond Program", "General Debenture Program") if name in text]


def parse_vancouver_issue(html: str) -> list[GovernmentBondIssue]:
    text = Document(html).text
    if "Inaugural Green Bond term sheet" not in text:
        return []
    section = text.split("Inaugural Green Bond term sheet", 1)[1].split("General Debenture Program")[0][:1400]
    amount = re.search(r"Amount: \$([\d,]+)\b", section)
    settlement = re.search(r"Settlement date: ([A-Z][a-z]+ \d{1,2}, 20\d{2})", section)
    maturity = re.search(r"Maturity date: ([A-Z][a-z]+ \d{1,2}, 20\d{2})", section)
    coupon = re.search(r"Coupon: (\d+(?:\.\d+)?)%", section)
    cusip = re.search(r"CUSIP: ([A-Z0-9]{9})\b", section)
    if not all((amount, settlement, maturity, coupon, cusip)):
        return []
    settled, matures = dated(settlement[1]), dated(maturity[1])
    value, rate = number(amount[1]), number(coupon[1])
    if not settled or not matures or matures <= settled or value is None or value <= 0 or rate is None or rate > 25:
        return []
    # Currency is not explicitly stated in this term sheet: do not infer it from '$'.
    return [GovernmentBondIssue(issuer_level="municipal", issuer="City of Vancouver", jurisdiction="BC",
        city="Vancouver", settlement_date=settled.date(), maturity_date=matures.date(), coupon_percent=rate,
        issue_amount=value, cusip=cusip[1], green=True, bond_type="green",
        official_url=MUNICIPALITIES["vancouver"][2], observed_at=settled)]


def parse_quebec_city_financing(html: str) -> tuple[float | None, str | None]:
    text = Document(html).text
    match = re.search(r"besoins de financement en (20\d{2}) sont de (\d+(?:,\d+)?) M\$", text)
    if not match:
        return None, None
    value = number(match[2], french=True)
    return (value * 1e6 if value is not None else None), match[1]


class MunicipalDebtService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, list[GovernmentBondIssue]] = shared_data_hub.cache(
            "municipal-bond-issues", max_entries=2,
        )

    async def _load_toronto(self) -> list[GovernmentBondIssue]:
        async with asyncio.timeout(4):
            response = await shared_http_client.request("GET", TORONTO_ISSUES_URL, attempts=1, timeout=3.0)
        response.raise_for_status()
        issues = parse_toronto_issues(response.text)
        if not issues:
            raise RuntimeError("Toronto official issue table unavailable")
        return issues

    async def _toronto(self) -> list[GovernmentBondIssue]:
        try:
            return await self._cache.get_or_load(
                "toronto", self._load_toronto, fresh_seconds=1800, stale_seconds=86_400,
            )
        except Exception:
            return []

    async def profile(self, slug: str) -> MunicipalDebtProfile | None:
        if slug not in MUNICIPALITIES:
            return None
        city, province, official_url = MUNICIPALITIES[slug]
        issues: list[GovernmentBondIssue] = []
        programs: list[str] = []
        amount = None
        fiscal_year = None
        if slug == "toronto":
            html, issues = await asyncio.gather(official_html(official_url), self._toronto())
        else:
            html = await official_html(official_url)
        if html is not None:
            if slug == "toronto":
                text = Document(html).text
                programs = [name for name in ("Green Debenture Program", "Social Debenture Program", "Sustainable Debenture Program") if name in text]
            elif slug == "vancouver":
                programs = parse_vancouver_programs(html)
                issues = parse_vancouver_issue(html)
            elif slug == "quebec":
                amount, fiscal_year = parse_quebec_city_financing(html)
        coverage = "partial" if issues or programs or amount is not None else "limited" if html is not None else "unavailable"
        source = TORONTO_ISSUES_URL if slug == "toronto" else official_url
        observed = max((row.observed_at for row in issues if row.observed_at), default=None)
        fields = {}
        if issues:
            fields["recent_issues"] = DebtFieldSource(official_url=source, observed_at=observed,
                description="Official published issues; dates belong to each issue")
        if programs:
            fields["bond_programs"] = DebtFieldSource(official_url=official_url, description="Official named bond programs")
        if amount is not None:
            fields["borrowing_program_amount"] = DebtFieldSource(official_url=official_url,
                description=f"Besoins de financement projetés en {fiscal_year} (M$ CAD)")
        return MunicipalDebtProfile(
            slug=slug, city=city, province=province, official_url=official_url,
            coverage=coverage, recent_issues=issues,
            borrowing_program_amount=amount, fiscal_year=fiscal_year, bond_programs=programs,
            green_social_sustainable_program=" · ".join(name for name in programs if name != "General Debenture Program") or None,
            source_urls=list(dict.fromkeys([source, official_url])), field_sources=fields,
            last_updated=observed,
            quality=FixedIncomeDataQuality(
                scope="municipal_issues" if issues else "municipal_profiles", status=coverage, source=source,
                observed_at=observed,
                freshness="delayed" if observed else "unavailable",
                coverage=f"{len(issues)} official issues" if issues else "Official financing profile" if programs or amount is not None
                else "Official source only" if html is not None else "Official source temporarily inaccessible",
            ),
        )


municipal_debt_service = MunicipalDebtService()
