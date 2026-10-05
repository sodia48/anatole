"""Verified government search scope for Canada 360.

Municipal and Indigenous governments can be added as individual records after
their domains and jurisdictional remit have been verified. They are not covered
by the current registry.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class OfficialSource:
    jurisdiction: str
    agency: str
    official_domains: tuple[str, ...]
    categories: tuple[str, ...]
    language: tuple[str, ...]
    source_type: str
    trust_priority: int
    path_prefixes: tuple[str, ...] = ()


FEDERAL_SOURCES = (
    OfficialSource("CA", "Government of Canada", ("canada.ca",),
                   ("services", "benefits", "health", "education", "business"),
                   ("fr", "en"), "federal_portal", 80),
    OfficialSource("CA", "Statistics Canada", ("statcan.gc.ca",),
                   ("statistics",), ("fr", "en"), "statistics", 100),
    OfficialSource("CA", "Bank of Canada", ("bankofcanada.ca",),
                   ("statistics", "finance"), ("fr", "en"), "central_bank", 100),
    OfficialSource("CA", "Canada Revenue Agency", ("canada.ca",),
                   ("taxes", "benefits"), ("fr", "en"), "federal_agency", 95,
                   ("/en/revenue-agency/", "/fr/agence-revenu/")),
    OfficialSource("CA", "Immigration, Refugees and Citizenship Canada", ("canada.ca",),
                   ("immigration",), ("fr", "en"), "federal_agency", 95,
                   ("/en/immigration-refugees-citizenship/", "/fr/immigration-refugies-citoyennete/")),
    OfficialSource("CA", "Service Canada", ("canada.ca",),
                   ("benefits", "services", "documents"), ("fr", "en"),
                   "federal_agency", 95,
                   ("/en/employment-social-development/services/", "/fr/emploi-developpement-social/services/")),
    OfficialSource("CA", "Health Canada", ("canada.ca",),
                   ("health", "benefits"), ("fr", "en"), "federal_agency", 95,
                   ("/en/health-canada/", "/fr/sante-canada/")),
    OfficialSource("CA", "Employment and Social Development Canada",
                   ("canada.ca", "jobbank.gc.ca"),
                   ("benefits", "employment", "education"), ("fr", "en"),
                   "federal_agency", 90,
                   ("/en/employment-social-development/", "/fr/emploi-developpement-social/")),
    OfficialSource("CA", "Innovation Canada", ("innovation.canada.ca", "canada.ca"),
                   ("business",), ("fr", "en"), "federal_agency", 90,
                   ("/en/innovation-science-economic-development/", "/fr/innovation-sciences-developpement-economique/")),
    OfficialSource("CA", "Veterans Affairs Canada", ("veterans.gc.ca",),
                   ("benefits", "health", "services"), ("fr", "en"),
                   "federal_agency", 95),
)

REGIONAL_SOURCES = (
    OfficialSource("QC", "Gouvernement du Québec",
                   ("quebec.ca", "revenuquebec.ca", "ramq.gouv.qc.ca", "statistique.quebec.ca"),
                   ("benefits", "taxes", "health", "business", "education"),
                   ("fr", "en"), "provincial_government", 95),
    OfficialSource("ON", "Government of Ontario", ("ontario.ca",),
                   ("benefits", "health", "business", "education"), ("fr", "en"),
                   "provincial_government", 95),
    OfficialSource("BC", "Government of British Columbia", ("gov.bc.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "provincial_government", 95),
    OfficialSource("AB", "Government of Alberta", ("alberta.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "provincial_government", 95),
    OfficialSource("SK", "Government of Saskatchewan", ("saskatchewan.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "provincial_government", 95),
    OfficialSource("MB", "Government of Manitoba", ("gov.mb.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "provincial_government", 95),
    OfficialSource("NB", "Government of New Brunswick", ("gnb.ca",),
                   ("benefits", "health", "business", "education"), ("fr", "en"),
                   "provincial_government", 95),
    OfficialSource("NS", "Government of Nova Scotia", ("novascotia.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "provincial_government", 95),
    OfficialSource("PE", "Government of Prince Edward Island", ("princeedwardisland.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "provincial_government", 95),
    OfficialSource("NL", "Government of Newfoundland and Labrador", ("gov.nl.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "provincial_government", 95),
    OfficialSource("YT", "Government of Yukon", ("yukon.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "territorial_government", 95),
    OfficialSource("NT", "Government of Northwest Territories", ("gov.nt.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "territorial_government", 95),
    OfficialSource("NU", "Government of Nunavut", ("gov.nu.ca",),
                   ("benefits", "health", "business", "education"), ("en", "fr"),
                   "territorial_government", 95),
)

SOURCE_REGISTRY = (*FEDERAL_SOURCES, *REGIONAL_SOURCES)
FEDERAL_DOMAINS = tuple(dict.fromkeys(
    domain for source in FEDERAL_SOURCES for domain in source.official_domains
))
REGIONAL_DOMAINS = {
    source.jurisdiction: source.official_domains for source in REGIONAL_SOURCES
}


def official_domains(jurisdictions: list[str] | tuple[str, ...]) -> list[str]:
    domains = list(FEDERAL_DOMAINS)
    for code in jurisdictions:
        domains.extend(REGIONAL_DOMAINS.get(code, ()))
    return list(dict.fromkeys(domains))


def identify_official_source(url: str) -> OfficialSource | None:
    try:
        parsed = urlparse(url)
        if (parsed.scheme != "https" or not parsed.hostname
                or parsed.username or parsed.password
                or parsed.port not in (None, 443)):
            return None
        host = parsed.hostname.lower().rstrip(".")
        path = parsed.path.lower()
    except ValueError:
        return None

    matches = [
        source for source in SOURCE_REGISTRY
        if any(host == domain or host.endswith(f".{domain}")
               for domain in source.official_domains)
        and (
            not source.path_prefixes
            or any(path.startswith(prefix) for prefix in source.path_prefixes)
            or any(
                domain != "canada.ca"
                and (host == domain or host.endswith(f".{domain}"))
                for domain in source.official_domains
            )
        )
    ]
    if not matches:
        return None
    return max(matches, key=lambda source: (bool(source.path_prefixes), source.trust_priority))
