from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator


NodeType = Literal[
    "company",
    "private_company",
    "government",
    "end_market",
    "commodity",
]
RelationshipType = Literal[
    "supplier",
    "customer",
    "distributor",
    "strategic_partner",
    "joint_venture",
    "parent",
    "subsidiary",
    "major_contract",
]
RelationshipStatus = Literal["active", "historical", "unknown"]
RelationshipConfidence = Literal["verified", "corroborated", "secondary"]
RelationshipMateriality = Literal["critical", "material", "notable", "unknown"]
EvidenceSourceType = Literal[
    "issuer_filing",
    "annual_report",
    "sedar",
    "sec",
    "investor_relations",
    "press_release",
    "finnhub",
    "other",
]
SourceAvailability = Literal["available", "partial", "unavailable"]


class CompanyNetworkNode(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    ticker: str | None = Field(default=None, max_length=20)
    name: str = Field(min_length=1, max_length=240)
    exchange: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, max_length=80)
    sector: str | None = Field(default=None, max_length=120)
    industry: str | None = Field(default=None, max_length=160)
    public_company: bool
    node_type: NodeType


class RelationshipEvidence(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    relationship_id: str | None = Field(default=None, max_length=120)
    source_type: EvidenceSourceType
    title: str = Field(min_length=1, max_length=300)
    url: HttpUrl
    published_at: datetime | None = None
    document_date: datetime | None = None
    excerpt: str = Field(min_length=1, max_length=600)
    issuer: str = Field(min_length=1, max_length=240)


class CompanyRelationship(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    source_node_id: str = Field(min_length=1, max_length=120)
    target_node_id: str = Field(min_length=1, max_length=120)
    relationship_type: RelationshipType
    direction: Literal["source_to_target"] = "source_to_target"
    status: RelationshipStatus = "unknown"
    confidence: RelationshipConfidence
    materiality: RelationshipMateriality = "unknown"
    revenue_share_percent: float | None = Field(default=None, ge=0, le=100)
    contract_value: float | None = Field(default=None, ge=0)
    contract_currency: str | None = Field(default=None, min_length=3, max_length=3)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    source_count: int = Field(ge=1)
    last_verified_at: datetime | None = None
    evidence: list[RelationshipEvidence] = Field(min_length=1, max_length=20)
    correlation_2w: float | None = Field(default=None, ge=-1, le=1)
    correlation_1m: float | None = Field(default=None, ge=-1, le=1)
    correlation_3m: float | None = Field(default=None, ge=-1, le=1)
    correlation_6m: float | None = Field(default=None, ge=-1, le=1)
    correlation_1y: float | None = Field(default=None, ge=-1, le=1)
    correlation_2y: float | None = Field(default=None, ge=-1, le=1)

    @model_validator(mode="after")
    def require_real_quantification(self) -> "CompanyRelationship":
        if self.contract_value is None:
            self.contract_currency = None
        return self


class SectorExposure(BaseModel):
    sector: str
    verified_relationship_count: int = Field(ge=0)
    quantified_revenue_share_percent: float | None = Field(default=None, ge=0, le=100)


class CompanyNetworkSourceStatus(BaseModel):
    source: str
    status: SourceAvailability
    count: int = Field(default=0, ge=0)
    detail: str
    detail_en: str | None = None


class CompanyNetworkCoverage(BaseModel):
    depth: Literal[1, 2]
    node_limit: int = Field(default=40, ge=1, le=40)
    truncated: bool = False
    verified_relationships: int = Field(default=0, ge=0)
    corroborated_relationships: int = Field(default=0, ge=0)
    secondary_relationships: int = Field(default=0, ge=0)
    official_documents_scanned: int = Field(default=0, ge=0)
    message_fr: str | None = None
    message_en: str | None = None


class CompanyNetworkSnapshot(BaseModel):
    center: CompanyNetworkNode
    nodes: list[CompanyNetworkNode] = Field(max_length=40)
    relationships: list[CompanyRelationship] = Field(max_length=80)
    sector_exposure: list[SectorExposure] = Field(default_factory=list)
    sources: list[CompanyNetworkSourceStatus] = Field(default_factory=list)
    generated_at: datetime
    stale: bool = False
    coverage: CompanyNetworkCoverage


class CompanyRelationshipPath(BaseModel):
    from_company: CompanyNetworkNode
    to_company: CompanyNetworkNode
    nodes: list[CompanyNetworkNode] = Field(default_factory=list, max_length=4)
    relationships: list[CompanyRelationship] = Field(default_factory=list, max_length=3)
    depth: int = Field(default=0, ge=0, le=3)
    generated_at: datetime
    found: bool
    message_fr: str | None = None
    message_en: str | None = None


class RelationshipEvidenceGroup(BaseModel):
    relationship: CompanyRelationship
    evidence: list[RelationshipEvidence]


class CompanyNetworkEvidenceResponse(BaseModel):
    ticker: str
    groups: list[RelationshipEvidenceGroup]
    generated_at: datetime
