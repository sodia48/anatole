"""Allowlisted official municipal debt sources with bounded table parsing."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from html.parser import HTMLParser

from app.core.data_hub import shared_data_hub
from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.fixed_income import FixedIncomeDataQuality, GovernmentBondIssue, MunicipalDebtProfile


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
    return float(match.group(1).replace(",", "")) * (1_000_000_000 if match.group(2).lower() == "billion" else 1_000_000)


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
        result.append(GovernmentBondIssue(
            issuer_level="municipal", issuer="City of Toronto", jurisdiction="ON", city="Toronto",
            cusip=cusip, settlement_date=settled_date, maturity_date=maturity_date,
            coupon_percent=coupon_percent, issue_amount=_amount(amount), currency=currency,
            outstanding_amount=_amount(outstanding), official_url=TORONTO_ISSUES_URL,
            observed_at=datetime.combine(settled_date, datetime.min.time(), UTC),
        ))
    return result[:30]


class MunicipalDebtService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, list[GovernmentBondIssue]] = shared_data_hub.cache(
            "municipal-bond-issues", max_entries=2,
        )

    async def _load_toronto(self) -> list[GovernmentBondIssue]:
        response = await shared_http_client.request("GET", TORONTO_ISSUES_URL, attempts=1)
        response.raise_for_status()
        issues = parse_toronto_issues(response.text)
        if not issues:
            raise RuntimeError("Toronto official issue table unavailable")
        return issues

    async def profile(self, slug: str) -> MunicipalDebtProfile | None:
        if slug not in MUNICIPALITIES:
            return None
        city, province, official_url = MUNICIPALITIES[slug]
        issues: list[GovernmentBondIssue] = []
        if slug == "toronto":
            try:
                issues = await self._cache.get_or_load(
                    "toronto", self._load_toronto, fresh_seconds=1800, stale_seconds=86_400,
                )
            except Exception:
                pass
        coverage = "partial" if issues else "limited" if official_url else "unavailable"
        source = TORONTO_ISSUES_URL if slug == "toronto" else official_url
        return MunicipalDebtProfile(
            slug=slug, city=city, province=province, official_url=official_url,
            coverage=coverage, recent_issues=issues,
            green_social_sustainable_program=("Green, social and sustainable debenture programs" if slug == "toronto" else None),
            source_urls=[url for url in (official_url, source) if url],
            last_updated=max((row.observed_at for row in issues if row.observed_at), default=None),
            quality=FixedIncomeDataQuality(
                scope="municipal_issues" if issues else "municipal_profiles", status=coverage, source=source,
                observed_at=max((row.observed_at for row in issues if row.observed_at), default=None),
                freshness="delayed" if issues else "unavailable",
                coverage=f"{len(issues)} official issues" if issues else "Official profile only" if official_url else "No verified parser",
            ),
        )


municipal_debt_service = MunicipalDebtService()
