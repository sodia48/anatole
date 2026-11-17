"""Persistent, precomputed Form 13F reads. Collection never runs in this module."""

from __future__ import annotations

import gzip
import json
import re
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import (
    Column,
    Float,
    Index,
    Integer,
    MetaData,
    PrimaryKeyConstraint,
    String,
    Table,
    Text,
    and_,
    delete,
    func,
    insert,
    select,
    update,
)
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.schemas.institutions import (
    InstitutionDetail,
    InstitutionFlow,
    InstitutionSourceStatus,
    InstitutionsSnapshot,
)


def snapshot_from_payload(payload: dict[str, Any]) -> InstitutionsSnapshot:
    """Keep builder provenance when converting its JSON to the API model."""
    snapshot = InstitutionsSnapshot.model_validate(payload)
    source_url = str(payload.get("source_url") or "")
    if not snapshot.sources and source_url.startswith("https://www.sec.gov/"):
        sources = [InstitutionSourceStatus(
            source="SEC EDGAR — Form 13F-HR",
            status="available",
            detail="Snapshot validé depuis le dataset structuré SEC.",
            url=source_url,
            updated_at=snapshot.validated_at or snapshot.generated_at,
        )]
        previous_url = str(payload.get("previous_source_url") or "")
        if previous_url.startswith("https://www.sec.gov/"):
            sources.append(InstitutionSourceStatus(
                source="SEC EDGAR — période comparative",
                status="available",
                detail="Dataset utilisé pour comparer les quantités déclarées au trimestre précédent.",
                url=previous_url,
                updated_at=snapshot.validated_at or snapshot.generated_at,
            ))
        snapshot = snapshot.model_copy(update={
            "sources": sources
        })
    return snapshot


class InstitutionStore:
    """Small schema on the existing account database, with atomic period publication."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self.metadata = MetaData()
        self.snapshots = Table(
            "institution_snapshots", self.metadata,
            Column("period", String(10), primary_key=True),
            Column("payload", Text, nullable=False),
            Column("published_at", String(40), nullable=False),
        )
        self.details = Table(
            "institution_details", self.metadata,
            Column("period", String(10), nullable=False),
            Column("cik", String(10), nullable=False),
            Column("payload", Text, nullable=False),
            PrimaryKeyConstraint("period", "cik"),
        )
        self.holdings = Table(
            "institution_holdings", self.metadata,
            Column("period", String(10), nullable=False),
            Column("cik", String(10), nullable=False),
            Column("cusip", String(9), nullable=False),
            Column("security_class", String(120), nullable=False),
            Column("put_call", String(8), nullable=False, default=""),
            Column("ticker", String(32), nullable=True),
            Column("issuer", String(300), nullable=False),
            Column("status", String(16), nullable=False),
            Column("shares", Float, nullable=False),
            Column("previous_shares", Float, nullable=False),
            Column("share_change", Float, nullable=False),
            Column("value", Float, nullable=False),
            Column("amount_type", String(8), nullable=False),
            PrimaryKeyConstraint("period", "cik", "cusip", "security_class", "put_call"),
        )
        Index("ix_institution_holdings_cusip_period", self.holdings.c.cusip, self.holdings.c.period)
        self.cusip_value_index = Index(
            "ix_institution_holdings_cusip_period_value",
            self.holdings.c.cusip, self.holdings.c.period,
            self.holdings.c.value.desc(), self.holdings.c.cik,
        )
        Index("ix_institution_holdings_ticker_period", self.holdings.c.ticker, self.holdings.c.period)
        Index("ix_institution_holdings_period_value", self.holdings.c.period, self.holdings.c.value)
        self.filings = Table(
            "institution_filings", self.metadata,
            Column("accession", String(24), primary_key=True),
            Column("cik", String(10), nullable=False),
            Column("period", String(10), nullable=False),
            Column("form", String(12), nullable=False),
            Column("amendment_type", String(40), nullable=False),
            Column("filed_at", String(10), nullable=False),
            Column("source_url", Text, nullable=False),
        )
        Index("ix_institution_filings_cik_period", self.filings.c.cik, self.filings.c.period)
        self.runs = Table(
            "institution_ingestion_runs", self.metadata,
            Column("run_id", String(36), primary_key=True),
            Column("period", String(10), nullable=True),
            Column("status", String(20), nullable=False),
            Column("started_at", String(40), nullable=False),
            Column("finished_at", String(40), nullable=True),
            Column("source_url", Text, nullable=True),
            Column("error_category", String(100), nullable=True),
            Column("institutions_count", Integer, nullable=False, default=0),
        )
        self.symbols = Table(
            "institution_symbol_map", self.metadata,
            Column("cusip", String(9), primary_key=True),
            Column("ticker", String(32), nullable=False),
            Column("source_url", Text, nullable=False),
            Column("verified_at", String(40), nullable=False),
        )
        Index("ix_institution_symbol_map_ticker", self.symbols.c.ticker)
        self.leases = Table(
            "institution_ingestion_leases", self.metadata,
            Column("name", String(40), primary_key=True),
            Column("owner", String(36), nullable=False),
            Column("expires_at", String(40), nullable=False),
        )

    def create_schema(self) -> None:
        self.metadata.create_all(self.engine)
        # create_all does not add a new index to an existing installation.
        self.cusip_value_index.create(self.engine, checkfirst=True)

    def drop_schema(self) -> None:
        self.metadata.drop_all(self.engine)

    def seed_symbols(self, path: Path) -> int:
        """Import only explicit SEC-supported CUSIP↔ticker pairs."""
        if not path.exists():
            return 0
        self.create_schema()
        rows = json.loads(path.read_text(encoding="utf-8"))
        with self.engine.begin() as connection:
            for row in rows:
                cusip = str(row["cusip"]).strip().upper()
                ticker = str(row["ticker"]).strip().upper()
                source_url = str(row["source_url"])
                if not re.fullmatch(r"[A-Z0-9]{9}", cusip) or not re.fullmatch(r"[A-Z0-9.\-]{1,32}", ticker):
                    raise ValueError("Invalid verified symbol mapping")
                if not source_url.startswith("https://www.sec.gov/"):
                    raise ValueError("Symbol mapping needs an official SEC source")
                existing = connection.execute(
                    select(self.symbols.c.cusip).where(self.symbols.c.cusip == cusip)
                ).scalar_one_or_none()
                if existing:
                    connection.execute(update(self.symbols).where(self.symbols.c.cusip == cusip).values(
                        ticker=ticker, source_url=source_url, verified_at=row["verified_at"],
                    ))
                else:
                    connection.execute(insert(self.symbols).values(
                        cusip=cusip, ticker=ticker, source_url=source_url,
                        verified_at=row["verified_at"],
                    ))
                connection.execute(update(self.holdings).where(self.holdings.c.cusip == cusip).values(ticker=ticker))
        return len(rows)

    def bootstrap_bundle(self, path: Path) -> bool:
        """Stage one manager at a time; expose the period only after validation."""
        if not path.exists():
            return False
        self.create_schema()
        with gzip.open(path, "rt", encoding="utf-8") as source:
            first = json.loads(source.readline())
            if first.get("kind") != "snapshot":
                raise ValueError("Invalid institution bundle")
            snapshot = snapshot_from_payload(first["payload"])
            if snapshot.report_period is None:
                raise ValueError("Bundle has no report period")
            current = self.latest_snapshot()
            if current and current.report_period and current.report_period >= snapshot.report_period:
                return False
            period = snapshot.report_period.isoformat()
            known = {item.cik for item in snapshot.institutions}
            if len(known) != len(snapshot.institutions):
                raise ValueError("Duplicate institution CIK in bundle")
            seen: set[str] = set()
            filings: list[dict[str, str]] = []
            with self.engine.begin() as connection:
                symbols = dict(connection.execute(
                    select(self.symbols.c.cusip, self.symbols.c.ticker)
                ).all())
                connection.execute(delete(self.holdings).where(self.holdings.c.period == period))
                connection.execute(delete(self.details).where(self.details.c.period == period))
                connection.execute(delete(self.filings).where(self.filings.c.period == period))
            for line in source:
                row = json.loads(line)
                if row.get("kind") == "detail":
                    detail = InstitutionDetail.model_validate(row["payload"])
                    cik = detail.institution.cik
                    if cik not in known or cik in seen or detail.institution.report_period != snapshot.report_period:
                        raise ValueError("Invalid manager detail in bundle")
                    seen.add(cik)
                    types = {(item[0], item[1], item[2]): item[3] for item in row["amount_types"]}
                    holdings = [{
                        "period": period, "cik": cik,
                        "cusip": item.cusip, "security_class": item.security_class,
                        "put_call": item.put_call or "",
                        "ticker": symbols.get(item.cusip) or item.ticker,
                        "issuer": item.issuer, "status": item.status,
                        "shares": item.shares, "previous_shares": item.previous_shares,
                        "share_change": item.share_change, "value": item.value,
                        "amount_type": types.get((item.cusip, item.security_class, item.put_call or ""), "SH"),
                    } for item in detail.holdings]
                    with self.engine.begin() as connection:
                        connection.execute(insert(self.details).values(
                            period=period, cik=cik, payload=detail.model_dump_json(),
                        ))
                        if holdings:
                            connection.execute(insert(self.holdings), holdings)
                elif row.get("kind") == "filing":
                    filing = row["payload"]
                    if filing["period"] != period or filing["cik"] not in known:
                        raise ValueError("Invalid filing in bundle")
                    filings.append(filing)
                else:
                    raise ValueError("Unexpected institution bundle row")
            if seen != known:
                raise ValueError("Incomplete bundled detail coverage")
            with self.engine.begin() as connection:
                if filings:
                    connection.execute(insert(self.filings), filings)
                connection.execute(insert(self.snapshots).values(
                    period=period, payload=snapshot.model_dump_json(),
                    published_at=datetime.now(UTC).isoformat(),
                ))
        return True

    def start_run(self, run_id: str, source_url: str) -> bool:
        self.create_schema()
        now = datetime.now(UTC)
        expires = (now + timedelta(hours=2)).isoformat()
        try:
            with self.engine.begin() as connection:
                existing = connection.execute(
                    select(self.leases.c.owner, self.leases.c.expires_at)
                    .where(self.leases.c.name == "13f")
                    .with_for_update()
                ).first()
                if existing and existing.expires_at > now.isoformat():
                    return False
                if existing:
                    connection.execute(
                        update(self.leases).where(self.leases.c.name == "13f")
                        .values(owner=run_id, expires_at=expires)
                    )
                else:
                    connection.execute(insert(self.leases).values(
                        name="13f", owner=run_id, expires_at=expires,
                    ))
                connection.execute(insert(self.runs).values(
                    run_id=run_id, period=None, status="running",
                    started_at=now.isoformat(), finished_at=None,
                    source_url=source_url, error_category=None,
                    institutions_count=0,
                ))
        except IntegrityError:
            return False
        return True

    def finish_run(
        self, run_id: str, *, period: date | None,
        institutions_count: int, error_category: str | None = None,
    ) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                update(self.runs).where(self.runs.c.run_id == run_id).values(
                    period=period.isoformat() if period else None,
                    status="failed" if error_category else "succeeded",
                    finished_at=datetime.now(UTC).isoformat(),
                    institutions_count=institutions_count,
                    error_category=error_category,
                )
            )
            connection.execute(
                delete(self.leases).where(and_(
                    self.leases.c.name == "13f", self.leases.c.owner == run_id,
                ))
            )

    def record_discovered_filings(self, filings: list[dict[str, str]]) -> int:
        """Idempotently stage new SEC metadata; does not publish mixed-quarter holdings."""
        inserted = 0
        with self.engine.begin() as connection:
            for filing in filings:
                if connection.execute(
                    select(self.filings.c.accession).where(
                        self.filings.c.accession == filing["accession"]
                    )
                ).scalar_one_or_none():
                    continue
                connection.execute(insert(self.filings).values(**filing))
                inserted += 1
        return inserted

    def partial_coverage(self, complete_period: date, validated_at: date) -> tuple[date | None, int, bool]:
        """Count later filings separately and flag amendments to the complete period."""
        period = complete_period.isoformat()
        with self.engine.connect() as connection:
            latest = connection.execute(
                select(func.max(self.filings.c.period)).where(self.filings.c.period > period)
            ).scalar_one_or_none()
            count = 0
            if latest:
                count = connection.execute(
                    select(func.count(func.distinct(self.filings.c.cik))).where(
                        self.filings.c.period == latest
                    )
                ).scalar_one()
            amendment = connection.execute(
                select(self.filings.c.accession).where(and_(
                    self.filings.c.period == period,
                    self.filings.c.form == "13F-HR/A",
                    self.filings.c.filed_at > validated_at.isoformat(),
                )).limit(1)
            ).scalar_one_or_none() is not None
        return (date.fromisoformat(latest) if latest else None, count, amendment)

    def publish(
        self,
        snapshot: InstitutionsSnapshot,
        details: list[InstitutionDetail],
        *,
        amount_types: dict[tuple[str, str, str, str], str] | None = None,
        filings: list[dict[str, str]] | None = None,
    ) -> None:
        period = snapshot.report_period
        if period is None or not snapshot.institutions:
            raise ValueError("A validated report period and institutions are required")
        if any(item.report_period != period for item in snapshot.institutions):
            raise ValueError("Mixed report periods")
        known = {item.cik for item in snapshot.institutions}
        if len(known) != len(snapshot.institutions):
            raise ValueError("Duplicate institution CIK")
        if any(item.institution.cik not in known or item.institution.report_period != period for item in details):
            raise ValueError("Detail outside the validated period")
        period_text = period.isoformat()
        amount_types = amount_types or {}
        self.create_schema()
        with self.engine.begin() as connection:
            symbols = dict(connection.execute(
                select(self.symbols.c.cusip, self.symbols.c.ticker)
            ).all())
            connection.execute(delete(self.holdings).where(self.holdings.c.period == period_text))
            connection.execute(delete(self.details).where(self.details.c.period == period_text))
            connection.execute(delete(self.filings).where(self.filings.c.period == period_text))
            connection.execute(delete(self.snapshots).where(self.snapshots.c.period == period_text))
            for detail in details:
                connection.execute(insert(self.details).values(
                    period=period_text,
                    cik=detail.institution.cik,
                    payload=detail.model_dump_json(),
                ))
                rows = []
                for holding in detail.holdings:
                    key = (detail.institution.cik, holding.cusip, holding.security_class, holding.put_call or "")
                    rows.append({
                        "period": period_text,
                        "cik": detail.institution.cik,
                        "cusip": holding.cusip,
                        "security_class": holding.security_class,
                        "put_call": holding.put_call or "",
                        "ticker": symbols.get(holding.cusip) or holding.ticker,
                        "issuer": holding.issuer,
                        "status": holding.status,
                        "shares": holding.shares,
                        "previous_shares": holding.previous_shares,
                        "share_change": holding.share_change,
                        "value": holding.value,
                        "amount_type": amount_types.get(key, "SH"),
                    })
                if rows:
                    connection.execute(insert(self.holdings), rows)
            if filings:
                connection.execute(insert(self.filings), filings)
            connection.execute(insert(self.snapshots).values(
                period=period_text,
                payload=snapshot.model_dump_json(),
                published_at=datetime.now(UTC).isoformat(),
            ))

    def latest_snapshot(self) -> InstitutionsSnapshot | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                select(self.snapshots.c.payload).order_by(self.snapshots.c.period.desc()).limit(1)
            ).scalar_one_or_none()
        return InstitutionsSnapshot.model_validate_json(row) if row else None

    def verified_ticker_exists(self, ticker: str) -> bool:
        with self.engine.connect() as connection:
            return connection.execute(
                select(self.symbols.c.cusip).where(self.symbols.c.ticker == ticker).limit(1)
            ).scalar_one_or_none() is not None

    def _cusip_for_query(self, connection: Any, query: str, period: date) -> str | None:
        """Resolve a verified ticker before touching the large holdings index."""
        if re.fullmatch(r"[A-Z0-9]{9}", query):
            return query
        cusips = connection.execute(
            select(self.symbols.c.cusip).where(self.symbols.c.ticker == query)
        ).scalars().all()
        if not cusips:
            cusips = connection.execute(
                select(self.holdings.c.cusip).where(and_(
                    self.holdings.c.ticker == query,
                    self.holdings.c.period == period.isoformat(),
                )).distinct()
            ).scalars().all()
        if len(cusips) > 1:
            raise ValueError("Symbole ambigu : recherchez par CUSIP")
        return cusips[0] if cusips else None

    def detail(self, cik: str, period: date | None = None) -> InstitutionDetail | None:
        if period is None:
            active = self.latest_snapshot()
            period = active.report_period if active else None
        if period is None:
            return None
        with self.engine.connect() as connection:
            statement = select(self.details.c.payload).where(self.details.c.cik == cik)
            statement = statement.where(self.details.c.period == period.isoformat())
            row = connection.execute(statement.order_by(self.details.c.period.desc()).limit(1)).scalar_one_or_none()
            detail = InstitutionDetail.model_validate_json(row) if row else None
            if detail:
                symbols = dict(connection.execute(
                    select(self.symbols.c.cusip, self.symbols.c.ticker)
                ).all())
                detail = detail.model_copy(update={
                    "holdings": [
                        item.model_copy(update={"ticker": symbols.get(item.cusip) or item.ticker})
                        for item in detail.holdings
                    ]
                })
        return detail

    def activity(self, query: str, period: date) -> InstitutionFlow | None:
        needle = query.strip().upper()
        with self.engine.connect() as connection:
            cusip = self._cusip_for_query(connection, needle, period)
            if not cusip:
                return None
            rows = connection.execute(
                select(self.holdings).where(and_(
                    self.holdings.c.period == period.isoformat(),
                    self.holdings.c.cusip == cusip,
                )).order_by(self.holdings.c.value.desc())
            ).mappings().all()
            if not rows:
                return None
        snapshot = self.latest_snapshot()
        names = {item.cik: item.name for item in snapshot.institutions} if snapshot else {}
        active = {row["cik"] for row in rows if row["status"] != "closed"}
        reliable_shares = all(row["put_call"] == "" and row["amount_type"] == "SH" for row in rows)
        return InstitutionFlow(
            ticker=next((row["ticker"] for row in rows if row["ticker"]), None),
            cusip=cusip, issuer=rows[0]["issuer"],
            institutions_holding=len(active),
            institutions_increased=len({row["cik"] for row in rows if row["status"] == "increased"}),
            institutions_reduced=len({row["cik"] for row in rows if row["status"] == "reduced"}),
            institutions_new=len({row["cik"] for row in rows if row["status"] == "new"}),
            institutions_closed=len({row["cik"] for row in rows if row["status"] == "closed"}),
            aggregate_share_change=sum(row["share_change"] for row in rows) if reliable_shares else None,
            current_reported_value=sum(row["value"] for row in rows),
            institution_names=list(dict.fromkeys(names.get(row["cik"], row["cik"]) for row in rows))[:10],
        )

    def holdings_page(self, query: str, period: date, *, limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
        needle = query.strip().upper()
        with self.engine.connect() as connection:
            cusip = self._cusip_for_query(connection, needle, period)
            if not cusip:
                return [], 0
            predicate = and_(
                self.holdings.c.cusip == cusip,
                self.holdings.c.period == period.isoformat(),
            )
            total = connection.execute(select(func.count()).select_from(self.holdings).where(predicate)).scalar_one()
            rows = connection.execute(
                select(self.holdings).where(predicate)
                .order_by(self.holdings.c.value.desc(), self.holdings.c.cik)
                .limit(limit).offset(offset)
            ).mappings().all()
        return [dict(row) for row in rows], total
