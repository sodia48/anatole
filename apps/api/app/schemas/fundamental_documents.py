"""Verifiable snippets from official issuer documents."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DocumentPassage(BaseModel):
    document_url: str
    document_title: str
    document_type: str
    published_at: datetime | None = None
    page_number: int | None = None
    topic: Literal["results", "cash_flow", "capital", "accounting", "outlook", "query"]
    excerpt: str


class DocumentComparison(BaseModel):
    topic: str
    current: DocumentPassage
    previous: DocumentPassage
    status: Literal["different_excerpt"] = "different_excerpt"
    note: str = "Text differs between publications; significance requires review."


class ResearchDocument(BaseModel):
    url: str
    title: str
    document_type: str
    published_at: datetime | None = None
    pages_scanned: int = 0


class ReportedObservation(BaseModel):
    metric: Literal["total_revenue", "net_income", "operating_cash_flow", "free_cash_flow", "total_debt"]
    value: float
    currency: str
    period_end: datetime
    period_type: Literal["annual", "quarterly"]
    source_name: str
    source_url: str
    filed_at: datetime | None = None


class FundamentalDocumentResearch(BaseModel):
    ticker: str
    status: Literal["available", "partial", "unavailable"]
    query: str | None = None
    source_stale: bool = False
    documents_scanned: int = 0
    documents: list[ResearchDocument] = Field(default_factory=list)
    passages: list[DocumentPassage] = Field(default_factory=list)
    reported_observations: list[ReportedObservation] = Field(default_factory=list)
    comparisons: list[DocumentComparison] = Field(default_factory=list)
    limitations_fr: list[str] = Field(default_factory=list)
    limitations_en: list[str] = Field(default_factory=list)
