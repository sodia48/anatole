"""Small, extensible adapters for sector facts with explicit provenance."""

from __future__ import annotations

import re
from datetime import datetime

from app.schemas.fundamentals import FinancialSource, FundamentalSnapshot, SectorMetric


BANK_KEYS = {
    "cet1": ("CET1", "%"),
    "pcl": ("Provisions pour pertes sur créances (PCL)", "millions, devise du rapport"),
    "roe": ("ROE publié", "%"),
    "efficiency_ratio": ("Ratio d'efficience", "%"),
    "impaired_loans": ("Prêts douteux bruts", "millions, devise du rapport"),
    "nim": ("Marge nette d'intérêts", "%"),
    "loans_to_deposits": ("Prêts / dépôts", "%"),
    "dividend_payout": ("Taux de distribution publié", "%"),
}

# Match only an explicit label and a value on the same short line. A document's
# own date and URL accompany each extracted value. Ambiguous tables are omitted.
_BANK_PATTERNS = {
    "cet1": r"(?:Common Equity Tier 1|CET1)(?:\s+(?:capital\s+)?ratio)?\s*[:|–-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%",
    "roe": r"(?:Return on (?:common )?equity|ROE)\s*[:|–-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%",
    "efficiency_ratio": r"(?:Efficiency ratio)\s*[:|–-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%",
    "nim": r"(?:Net interest margin|NIM)\s*[:|–-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%",
    "loans_to_deposits": r"(?:Loans.to.deposits? ratio)\s*[:|–-]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%",
    "dividend_payout": r"(?:Dividend payout ratio)\s*[:|–-]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%",
    "pcl": r"(?:Provision for credit losses|PCL)\s*[:|–-]?\s*\$?([\d,]+(?:\.\d{1,2})?)\s*(?:million|millions|M)\b",
    "impaired_loans": r"(?:Gross impaired loans)\s*[:|–-]?\s*\$?([\d,]+(?:\.\d{1,2})?)\s*(?:million|millions|M)\b",
}


def is_bank(snapshot: FundamentalSnapshot) -> bool:
    context = f"{snapshot.sector or ''} {snapshot.industry or ''}".casefold()
    return any(word in context for word in ("bank", "banque"))


def select_sector_metrics(snapshot: FundamentalSnapshot) -> list[SectorMetric]:
    if not is_bank(snapshot):
        return []
    return [metric for metric in snapshot.sector_metrics
            if metric.key in BANK_KEYS and metric.source.confidence == "official"
            and metric.source.source_type in {"sec_edgar_xbrl", "issuer_official_normalized", "issuer_official_document"}]


def extract_official_bank_metrics(text: str, *, source_url: str, source_name: str,
                                  filed_at: datetime | None) -> list[SectorMetric]:
    """Conservative extraction of labelled bank ratios from issuer text."""
    if not source_url.startswith("https://"):
        return []
    source = FinancialSource(source_type="issuer_official_document", source_name=source_name,
                             source_url=source_url, filed_at=filed_at, confidence="official")
    found: list[SectorMetric] = []
    for key, pattern in _BANK_PATTERNS.items():
        matches = [float(match.group(1).replace(",", "")) for line in text.splitlines()[:10000]
                   if len(line) <= 220 for match in [re.search(pattern, line, re.I)] if match]
        ceiling = 1_000_000 if key in {"pcl", "impaired_loans"} else 200
        if len(matches) != 1 or not 0 < matches[0] < ceiling:
            continue
        label, unit = BANK_KEYS[key]
        found.append(SectorMetric(key=key, label=label, value=matches[0], unit=unit,
                                  source=source, period_end=filed_at))
    return found
