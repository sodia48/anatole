from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Iterable

from app.schemas.company_network import (
    CompanyNetworkNode,
    CompanyRelationship,
    EvidenceSourceType,
    RelationshipConfidence,
    RelationshipEvidence,
    RelationshipMateriality,
    RelationshipStatus,
    RelationshipType,
)


OFFICIAL_SOURCE_TYPES: set[EvidenceSourceType] = {
    "issuer_filing",
    "annual_report",
    "sedar",
    "sec",
    "investor_relations",
    "press_release",
}
CORPORATE_SUFFIXES = re.compile(
    r"\b(?:incorporated|inc|corporation|corp|limited|ltd|plc|company|co)\.?$",
    re.IGNORECASE,
)
SENTENCE_SPLIT = re.compile(
    r"(?<!\bInc)(?<!\bLtd)(?<!\bCorp)(?<!\bCo)(?<!\bU\.S)"
    r"(?<=[.!?])\s+(?=[A-Z])|[\r\n]+"
)
PRIVATE_NAME = (
    r"[A-Z][A-Za-z0-9&'’.\-]{1,40}"
    r"(?:\s+(?:[A-Z][A-Za-z0-9&'’.\-]{1,40}|of|the|and)){0,5}"
)
PRIVATE_PATTERNS: tuple[tuple[RelationshipType, re.Pattern[str]], ...] = (
    ("supplier", re.compile(rf"(?i:(?:sourced|procured|purchased)(?:\s+\w+){{0,5}}\s+from)\s+(?P<name>{PRIVATE_NAME})")),
    ("supplier", re.compile(rf"(?i:provided\s+by)\s+(?P<name>{PRIVATE_NAME})")),
    ("customer", re.compile(rf"(?i:(?:sales\s+to|revenue\s+from|purchased\s+by))\s+(?P<name>{PRIVATE_NAME})")),
    ("strategic_partner", re.compile(rf"(?i:(?:partnered|collaborated)\s+with)\s+(?P<name>{PRIVATE_NAME})")),
    ("strategic_partner", re.compile(rf"(?i:(?:partnership|alliance|collaboration)\s+with)\s+(?P<name>{PRIVATE_NAME})")),
    ("joint_venture", re.compile(rf"(?i:(?:joint\s+venture|\bJV\b)\s+with)\s+(?P<name>{PRIVATE_NAME})")),
    ("major_contract", re.compile(rf"(?i:(?:contract\s+with|selected\s+by))\s+(?P<name>{PRIVATE_NAME})")),
    ("parent", re.compile(rf"(?i:subsidiary\s+of)\s+(?P<name>{PRIVATE_NAME})")),
)
GENERIC_PRIVATE_NAMES = {
    "customer",
    "customers",
    "supplier",
    "suppliers",
    "partner",
    "partners",
    "company",
    "government",
    "market",
    "the company",
}
PRIVATE_LOCATION_PREFIX = re.compile(
    r"^(?:(?:canadian|american|british|european|u\.?s\.?|u\.?k\.?)"
    r"-based)\s+",
    re.IGNORECASE,
)
NON_COMMERCIAL_PARTNERSHIP_TERMS = (
    "charity",
    "charitable",
    "donation",
    "non-profit",
    "nonprofit",
    "scholarship",
)


@dataclass(frozen=True, slots=True)
class RelationshipDocument:
    source_type: EvidenceSourceType
    title: str
    url: str
    text: str
    issuer: str
    published_at: datetime | None = None
    document_date: datetime | None = None


def _normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(character for character in value if not unicodedata.combining(character))
    value = value.lower().replace("&", " and ")
    return " ".join(re.sub(r"[^a-z0-9.%$'\- ]+", " ", value).split())


def _alias_key(value: str) -> str:
    # Corporate names commonly vary only by terminal punctuation (Corp vs
    # Corp.). Removing boundary punctuation keeps resolution exact without
    # enabling substring or fuzzy ticker inference.
    return _normalized(value).strip(" .,-")


def _identifier(*parts: str) -> str:
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"cn-{digest}"


def node_id(ticker: str | None, name: str) -> str:
    identity = ticker.upper() if ticker else _normalized(name)
    return _identifier("node", identity)


def relationship_id(source_node_id: str, target_node_id: str, relationship_type: RelationshipType) -> str:
    return _identifier("relationship", source_node_id, target_node_id, relationship_type)


class CompanyEntityIndex:
    """Exact company resolver. It never derives a ticker from a company name."""

    def __init__(self, nodes: Iterable[CompanyNetworkNode] = ()) -> None:
        self._nodes: dict[str, CompanyNetworkNode] = {}
        self._aliases: dict[str, CompanyNetworkNode] = {}
        for node in nodes:
            self.add(node)

    @staticmethod
    def aliases_for(node: CompanyNetworkNode) -> set[str]:
        aliases = {_alias_key(node.name)}
        if node.ticker:
            aliases.add(_alias_key(node.ticker))
            aliases.add(_alias_key(node.ticker.replace(".", " ")))
        without_suffix = CORPORATE_SUFFIXES.sub("", node.name).strip(" ,.")
        if len(without_suffix) >= 3:
            aliases.add(_alias_key(without_suffix))
        return {alias for alias in aliases if alias}

    def add(self, node: CompanyNetworkNode, aliases: Iterable[str] = ()) -> None:
        self._nodes[node.id] = node
        for alias in self.aliases_for(node) | {_alias_key(item) for item in aliases}:
            if alias:
                self._aliases.setdefault(alias, node)

    def resolve_exact(self, value: str) -> CompanyNetworkNode | None:
        return self._aliases.get(_alias_key(value))

    def mentions(self, sentence: str, *, exclude_id: str | None = None) -> list[tuple[CompanyNetworkNode, str]]:
        normalized = _normalized(sentence)
        found: dict[str, tuple[CompanyNetworkNode, str]] = {}
        for alias in sorted(self._aliases, key=len, reverse=True):
            node = self._aliases[alias]
            if node.id == exclude_id or node.id in found:
                continue
            if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized):
                found[node.id] = (node, alias)
        return list(found.values())


def private_node(name: str) -> CompanyNetworkNode:
    cleaned = " ".join(name.strip(" ,.;:()[]").split())
    return CompanyNetworkNode(
        id=node_id(None, cleaned),
        ticker=None,
        name=cleaned,
        exchange=None,
        country=None,
        sector=None,
        industry=None,
        public_company=False,
        node_type="private_company",
    )


def _clean_private_name(name: str) -> str:
    return PRIVATE_LOCATION_PREFIX.sub("", name).strip()


def _looks_like_issuer_heading(
    name: str,
    center: CompanyNetworkNode,
) -> bool:
    candidate = _normalized(name)
    center_name = _normalized(center.name)
    without_suffix = _normalized(
        CORPORATE_SUFFIXES.sub("", center.name).strip(" ,.")
    )
    prefixes = {
        value
        for value in (
            center_name,
            without_suffix,
            _normalized(center.ticker or ""),
        )
        if len(value) >= 3
    }
    return any(
        candidate == prefix
        or candidate.startswith(f"{prefix} ")
        for prefix in prefixes
    )


def _non_commercial_partnership(sentence: str) -> bool:
    value = _normalized(sentence)
    return any(
        term in value
        for term in NON_COMMERCIAL_PARTNERSHIP_TERMS
    )


def _explicit_type(sentence: str, alias: str) -> RelationshipType | None:
    value = _normalized(sentence)
    entity = rf"{re.escape(alias)}[.,]?"
    rules: tuple[tuple[RelationshipType, tuple[str, ...]], ...] = (
        ("parent", (
            rf"subsidiary of (?:the )?{entity}",
            rf"{entity} (?:is|was) (?:the )?parent company",
            rf"acquired by (?:the )?{entity}",
        )),
        ("subsidiary", (
            rf"{entity} (?:is|was|became) (?:a |an |the |our )?(?:wholly owned )?subsidiary",
            rf"(?:our|the company s) (?:wholly owned )?subsidiary {entity}",
        )),
        ("joint_venture", (
            rf"(?:joint venture|\bjv\b) with (?:the )?{entity}",
            rf"{entity}.{{0,35}}(?:joint venture|\bjv\b)",
        )),
        ("strategic_partner", (
            rf"(?:partnered|collaborated) with (?:the )?{entity}",
            rf"(?:strategic partnership|partnership|collaboration|alliance) with (?:the )?{entity}",
            rf"{entity} (?:is|was) (?:a |an |our )?strategic partner",
        )),
        ("distributor", (
            rf"{entity} (?:is|was|serves as) (?:a |an |our )?(?:exclusive )?distributor",
            rf"distributed (?:through|by) (?:the )?{entity}",
        )),
        ("major_contract", (
            rf"(?:awarded|received|signed|entered into).{{0,45}}contract (?:with|from) (?:the )?{entity}",
            rf"(?:contract with|selected by) (?:the )?{entity}",
            rf"{entity}.{{0,30}}awarded.{{0,30}}contract",
        )),
        ("supplier", (
            rf"(?:sourced|procured|purchased) (?:\w+ ){{0,5}}from (?:the )?{entity}",
            rf"provided by (?:the )?{entity}",
            rf"(?:suppliers include|supplier is|single source supplier|sole supplier).{{0,40}}{entity}",
            rf"{entity} (?:is|was|remains) (?:a |an |our )?(?:single source |sole |major )?supplier",
            rf"(?:utilize|use|rely on).{{0,35}}(?:foundries|manufacturers|suppliers).{{0,55}}{entity}",
            rf"{entity}.{{0,55}}(?:produce|manufacture|supply).{{0,35}}(?:our|the company s)",
        )),
        ("customer", (
            rf"(?:customers include|largest customer|major customer).{{0,45}}{entity}",
            rf"(?:sales to|revenue from|purchased by) (?:the )?{entity}",
            rf"{entity} (?:is|was|remains) (?:a |an |our )?(?:largest |major |material |significant )?(?:customer|client)",
            rf"{entity}.{{0,35}}(?:represented|accounted for).{{0,20}}% of (?:our |total )?revenue",
        )),
    )
    for relationship_type, patterns in rules:
        if any(re.search(pattern, value) for pattern in patterns):
            return relationship_type
    return None


def _revenue_share(sentence: str, alias: str) -> float | None:
    value = _normalized(sentence)
    entity = rf"{re.escape(alias)}[.,]?"
    patterns = (
        rf"{entity}.{{0,50}}(?:represented|accounted for|generated)\s+(\d{{1,3}}(?:\.\d+)?)\s*%\s+of\s+(?:our\s+|total\s+)?revenue",
        rf"(\d{{1,3}}(?:\.\d+)?)\s*%\s+of\s+(?:our\s+|total\s+)?revenue.{{0,50}}{entity}",
    )
    for pattern in patterns:
        match = re.search(pattern, value)
        if match:
            parsed = float(match.group(1))
            if 0 <= parsed <= 100:
                return parsed
    return None


def _contract_value(sentence: str) -> tuple[float | None, str | None]:
    patterns = (
        re.compile(r"\b(?P<currency>CAD|USD|C\$|US\$)\s*\$?\s*(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>million|billion)?\b", re.IGNORECASE),
        re.compile(r"\$\s*(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>million|billion)?\s*(?P<currency>CAD|USD)\b", re.IGNORECASE),
    )
    for pattern in patterns:
        match = pattern.search(sentence)
        if not match:
            continue
        amount = float(match.group("amount"))
        unit = (match.group("unit") or "").lower()
        if unit == "million":
            amount *= 1_000_000
        elif unit == "billion":
            amount *= 1_000_000_000
        currency = match.group("currency").upper().replace("C$", "CAD").replace("US$", "USD")
        return amount, currency
    return None, None


def _materiality(sentence: str, revenue_share: float | None, contract_value: float | None) -> RelationshipMateriality:
    value = _normalized(sentence)
    if "single source" in value or "sole supplier" in value or "critical" in value:
        return "critical"
    if (revenue_share is not None and revenue_share > 10) or contract_value is not None or "material" in value:
        return "material"
    if any(term in value for term in ("major customer", "largest customer", "strategic", "significant")):
        return "notable"
    return "unknown"


def _status(document_date: datetime | None) -> RelationshipStatus:
    if document_date is None:
        return "unknown"
    age_days = (datetime.now(UTC) - document_date.astimezone(UTC)).days
    return "historical" if age_days > 730 else "active"


def _short_excerpt(sentence: str) -> str:
    cleaned = " ".join(sentence.split())
    return cleaned if len(cleaned) <= 560 else cleaned[:557].rstrip() + "…"


def _relationship(
    center: CompanyNetworkNode,
    entity: CompanyNetworkNode,
    relationship_type: RelationshipType,
    sentence: str,
    alias: str,
    document: RelationshipDocument,
) -> CompanyRelationship:
    if relationship_type in {"supplier", "parent"}:
        source, target = entity, center
    else:
        source, target = center, entity
    relationship_identifier = relationship_id(source.id, target.id, relationship_type)
    excerpt = _short_excerpt(sentence)
    evidence = RelationshipEvidence(
        id=_identifier("evidence", relationship_identifier, document.url, excerpt),
        relationship_id=relationship_identifier,
        source_type=document.source_type,
        title=document.title,
        url=document.url,
        published_at=document.published_at,
        document_date=document.document_date,
        excerpt=excerpt,
        issuer=document.issuer,
    )
    revenue_share = _revenue_share(sentence, alias)
    contract_value, contract_currency = _contract_value(sentence) if relationship_type == "major_contract" else (None, None)
    date = document.document_date or document.published_at
    confidence: RelationshipConfidence = "verified" if document.source_type in OFFICIAL_SOURCE_TYPES else "secondary"
    return CompanyRelationship(
        id=relationship_identifier,
        source_node_id=source.id,
        target_node_id=target.id,
        relationship_type=relationship_type,
        status=_status(date),
        confidence=confidence,
        materiality=_materiality(sentence, revenue_share, contract_value),
        revenue_share_percent=revenue_share,
        contract_value=contract_value,
        contract_currency=contract_currency,
        first_seen=date,
        last_seen=date,
        source_count=1,
        last_verified_at=date if confidence == "verified" else None,
        evidence=[evidence],
    )


def merge_relationships(items: Iterable[CompanyRelationship]) -> list[CompanyRelationship]:
    merged: dict[str, CompanyRelationship] = {}
    for item in items:
        current = merged.get(item.id)
        if current is None:
            merged[item.id] = item.model_copy(deep=True)
            continue
        evidence = {entry.id: entry for entry in current.evidence}
        evidence.update({entry.id: entry for entry in item.evidence})
        current.evidence = list(evidence.values())[:20]
        distinct_sources = {str(entry.url) for entry in current.evidence}
        current.source_count = max(1, len(distinct_sources))
        if current.confidence != "verified":
            current.confidence = "corroborated" if len(distinct_sources) >= 2 else item.confidence
        current.revenue_share_percent = current.revenue_share_percent if current.revenue_share_percent is not None else item.revenue_share_percent
        if current.contract_value is None and item.contract_value is not None:
            current.contract_value = item.contract_value
            current.contract_currency = item.contract_currency
        dates = [date for date in (current.first_seen, item.first_seen) if date is not None]
        current.first_seen = min(dates) if dates else None
        dates = [date for date in (current.last_seen, item.last_seen) if date is not None]
        current.last_seen = max(dates) if dates else None
        verified_dates = [date for date in (current.last_verified_at, item.last_verified_at) if date is not None]
        current.last_verified_at = max(verified_dates) if verified_dates else None
        if current.status != "active" and item.status == "active":
            current.status = "active"
        order = {"unknown": 0, "notable": 1, "material": 2, "critical": 3}
        if order[item.materiality] > order[current.materiality]:
            current.materiality = item.materiality
    return list(merged.values())


class CompanyRelationshipExtractor:
    max_document_characters = 2_000_000

    def extract(
        self,
        center: CompanyNetworkNode,
        document: RelationshipDocument,
        index: CompanyEntityIndex,
    ) -> tuple[list[CompanyNetworkNode], list[CompanyRelationship]]:
        nodes: dict[str, CompanyNetworkNode] = {}
        relationships: list[CompanyRelationship] = []
        text = document.text[: self.max_document_characters]

        for raw_sentence in SENTENCE_SPLIT.split(text):
            sentence = " ".join(raw_sentence.split())
            if len(sentence) < 12 or len(sentence) > 1_500:
                continue
            matched_ids: set[str] = set()
            for entity, alias in index.mentions(sentence, exclude_id=center.id):
                relationship_type = _explicit_type(sentence, alias)
                if relationship_type is None:
                    continue
                if (
                    relationship_type == "strategic_partner"
                    and _non_commercial_partnership(sentence)
                ):
                    continue
                nodes[entity.id] = entity
                matched_ids.add(entity.id)
                relationships.append(_relationship(center, entity, relationship_type, sentence, alias, document))

            for expected_type, pattern in PRIVATE_PATTERNS:
                for match in pattern.finditer(sentence):
                    name = _clean_private_name(
                        " ".join(match.group("name").split()).strip(
                            " ,.;:()[]"
                        )
                    )
                    resolved = index.resolve_exact(name)
                    if resolved is None and _looks_like_issuer_heading(
                        name,
                        center,
                    ):
                        continue
                    entity = resolved or private_node(name)
                    if entity.id == center.id or entity.id in matched_ids or _normalized(entity.name) in GENERIC_PRIVATE_NAMES:
                        continue
                    relationship_type = _explicit_type(sentence, _normalized(name)) or expected_type
                    if (
                        relationship_type == "strategic_partner"
                        and _non_commercial_partnership(sentence)
                    ):
                        continue
                    nodes[entity.id] = entity
                    matched_ids.add(entity.id)
                    relationships.append(_relationship(center, entity, relationship_type, sentence, _normalized(name), document))

        return list(nodes.values()), merge_relationships(relationships)


company_relationship_extractor = CompanyRelationshipExtractor()
