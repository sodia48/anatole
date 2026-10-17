"""Bounded, extractive research over discovered issuer publications."""

from __future__ import annotations

import asyncio
import math
import re
from datetime import UTC, datetime

from app.schemas.fundamental_documents import (
    DocumentComparison,
    DocumentPassage,
    FundamentalDocumentResearch,
    ResearchDocument,
    ReportedObservation,
)
from app.schemas.fundamentals import FundamentalSnapshot, IssuerDocumentCandidate
from app.services.issuer_document_parser import financial_document_parser
from app.services.issuer_documents import issuer_financial_documents_service


TOPICS = {
    "results": re.compile(r"\b(revenue|net income|earnings|profit|revenus|bénéfice|résultat net)\b", re.I),
    "cash_flow": re.compile(r"\b(cash flow|free cash|operating cash|flux de trésorerie|flux disponible)\b", re.I),
    "capital": re.compile(r"\b(capital expenditure|dividend|repurchase|buyback|dépenses en capital|dividende|rachat)\b", re.I),
    "accounting": re.compile(r"\b(restat(?:ed|ement)|reclassif(?:ied|ication)|accounting polic(?:y|ies)|méthode comptable|retraitement)\b", re.I),
    "outlook": re.compile(r"\b(guidance|outlook|forecast|prévisions|perspectives)\b", re.I),
}
MAX_DOCUMENTS = 3
MAX_PAGES = 24
MAX_PASSAGES_PER_TOPIC = 2
MAX_EXCERPT_CHARS = 360
REPORTED_METRICS = ("total_revenue", "net_income", "operating_cash_flow", "free_cash_flow", "total_debt")


def _excerpt(line: str, match_start: int) -> str:
    """Return a literal substring, never generated or paraphrased text."""
    if len(line) <= MAX_EXCERPT_CHARS:
        return line.strip()
    start = max(0, match_start - 80)
    return line[start:start + MAX_EXCERPT_CHARS].strip()


def _passages(document: IssuerDocumentCandidate, pages: list[tuple[int | None, str]],
              query: str | None) -> list[DocumentPassage]:
    found: list[DocumentPassage] = []
    counts: dict[str, int] = {}
    terms = query.casefold().split() if query else []
    for page_number, text in pages:
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if len(line) < 16:
                continue
            topics: list[tuple[str, int]] = []
            lowered = line.casefold()
            if terms and all(term in lowered for term in terms):
                topics.append(("query", lowered.find(terms[0])))
            if not terms:
                for topic, pattern in TOPICS.items():
                    match = pattern.search(line)
                    if match is not None:
                        topics.append((topic, match.start()))
            for topic, match_start in topics:
                if counts.get(topic, 0) >= MAX_PASSAGES_PER_TOPIC:
                    continue
                found.append(DocumentPassage(
                    document_url=document.url,
                    document_title=document.title,
                    document_type=document.document_type,
                    published_at=document.published_at,
                    page_number=page_number,
                    topic=topic,
                    excerpt=_excerpt(line, match_start),
                ))
                counts[topic] = counts.get(topic, 0) + 1
    return found


def _comparisons(passages: list[DocumentPassage], documents: list[ResearchDocument], query: str | None) -> list[DocumentComparison]:
    annual = [item for item in documents if item.document_type == "annual" and item.published_at]
    annual.sort(key=lambda item: item.published_at or datetime.min.replace(tzinfo=UTC), reverse=True)
    if len(annual) < 2 or annual[0].published_at == annual[1].published_at:
        return []
    compared: list[DocumentComparison] = []
    for topic in (("query",) if query else ("results", "cash_flow", "capital", "accounting", "outlook")):
        current = next((item for item in passages if item.document_url == annual[0].url and item.topic == topic), None)
        previous = next((item for item in passages if item.document_url == annual[1].url and item.topic == topic), None)
        if current and previous and current.excerpt.casefold() != previous.excerpt.casefold():
            compared.append(DocumentComparison(topic=topic, current=current, previous=previous))
    return compared


def _reported_observations(snapshot: FundamentalSnapshot) -> list[ReportedObservation]:
    output: list[ReportedObservation] = []
    rows = sorted([*snapshot.annual_financials, *snapshot.quarterly_financials],
                  key=lambda item: item.period_end, reverse=True)[:4]
    for row in rows:
        source = row.source
        if (not source or source.confidence != "official"
                or source.source_type not in {"sec_edgar_xbrl", "issuer_official_normalized", "issuer_official_document"}
                or not source.source_url or not source.source_url.startswith("https://") or not row.currency):
            continue
        for key in REPORTED_METRICS:
            value = getattr(row, key)
            if value is None or not math.isfinite(value) or key in row.calculated_fields:
                continue
            output.append(ReportedObservation(metric=key, value=value, currency=row.currency,
                                              period_end=row.period_end, period_type=row.period_type,
                                              source_name=source.source_name, source_url=source.source_url,
                                              filed_at=source.filed_at))
    return output


async def research_official_documents(snapshot: FundamentalSnapshot, query: str | None = None) -> FundamentalDocumentResearch:
    """Extract exact passages; report missing pages and comparisons honestly."""
    if not snapshot.website:
        observations = _reported_observations(snapshot)
        return FundamentalDocumentResearch(ticker=snapshot.ticker, status="partial" if observations else "unavailable",
                                           query=query, source_stale=snapshot.stale, reported_observations=observations,
                                           limitations_fr=["Site de l'émetteur indisponible; aucun document n'a été déduit."],
                                           limitations_en=["Issuer website unavailable; no document was inferred."])
    try:
        _, discovered, discovery_error = await issuer_financial_documents_service.discover(snapshot.ticker, snapshot.website)
    except Exception:  # noqa: BLE001
        observations = _reported_observations(snapshot)
        return FundamentalDocumentResearch(ticker=snapshot.ticker, status="partial" if observations else "unavailable",
                                           query=query, source_stale=snapshot.stale, reported_observations=observations,
                                           limitations_fr=["Découverte des rapports temporairement indisponible."],
                                           limitations_en=["Issuer document discovery temporarily unavailable."])
    candidates = [item for item in discovered if item.url.startswith("https://")
                  and item.document_type in {"annual", "quarterly", "financial_statements"}]
    candidates.sort(key=lambda item: (item.published_at or datetime.min.replace(tzinfo=UTC), item.score), reverse=True)
    selected = candidates[:MAX_DOCUMENTS]
    documents: list[ResearchDocument] = []
    passages: list[DocumentPassage] = []
    limitations_fr = ["Les extraits sont des lignes littérales; ils ne constituent ni des états complets ni une opinion comptable.",
                      f"Recherche limitée à {MAX_DOCUMENTS} documents découverts et {MAX_PAGES} pages par PDF."]
    limitations_en = ["Excerpts are literal extracted lines; they are not complete statements or an accounting opinion.",
                      f"Search is limited to {MAX_DOCUMENTS} discovered documents and {MAX_PAGES} pages per PDF."]
    if discovery_error:
        limitations_fr.append(discovery_error)
        limitations_en.append("Document discovery returned an error.")
    for candidate in selected:
        try:
            content = await issuer_financial_documents_service.download_document(candidate)
        except Exception:  # noqa: BLE001
            content = None
        if not content:
            limitations_fr.append(f"Document indisponible : {candidate.title}")
            limitations_en.append(f"Document unavailable: {candidate.title}")
            continue
        try:
            pages = await asyncio.to_thread(financial_document_parser.extract_pages,
                                            content, candidate, max_pdf_pages=MAX_PAGES)
        except Exception:  # noqa: BLE001
            limitations_fr.append(f"Extraction du texte indisponible : {candidate.title}")
            limitations_en.append(f"Text extraction unavailable: {candidate.title}")
            continue
        if not pages:
            limitations_fr.append(f"Aucun texte extractible : {candidate.title}")
            limitations_en.append(f"No extractable text: {candidate.title}")
            continue
        documents.append(ResearchDocument(url=candidate.url, title=candidate.title,
                                          document_type=candidate.document_type,
                                          published_at=candidate.published_at,
                                          pages_scanned=len(pages)))
        passages.extend(_passages(candidate, pages, query))
    if any(item.page_number is None for item in passages):
        limitations_fr.append("Un numéro de page n'est affiché que pour le texte extrait d'une page physique du PDF.")
        limitations_en.append("A page number is shown only for PDF text extracted from a physical page.")
    comparisons = _comparisons(passages, documents, query)
    observations = _reported_observations(snapshot)
    return FundamentalDocumentResearch(
        ticker=snapshot.ticker, query=query, source_stale=snapshot.stale,
        status="unavailable" if not documents and not observations else "available" if passages else "partial",
        documents_scanned=len(documents), documents=documents, passages=passages,
        reported_observations=observations,
        comparisons=comparisons, limitations_fr=limitations_fr, limitations_en=limitations_en,
    )
