"""Bounded, request-independent discovery of recent SEC Form 13F filings."""

from __future__ import annotations

import asyncio
import logging
import math
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from xml.etree import ElementTree

from app.schemas.institutions import (
    InstitutionDetail, InstitutionHolding, InstitutionSourceStatus,
    InstitutionSummary, InstitutionsSnapshot,
)

from app.services.institution_store import InstitutionStore


logger = logging.getLogger("anatole.api.institutions.collector")
SUBMISSIONS_SOURCE = "https://data.sec.gov/submissions/"


@dataclass(frozen=True)
class DiscoveryResult:
    checked: int
    failed: int
    new_filings: int
    latest_partial_period: date | None


@dataclass(frozen=True)
class CollectionResult:
    checked: int
    failed: int
    staged: int
    published_period: date | None
    reporting: int


def _latest_closed_quarter(today: date) -> date:
    ends = [date(today.year, 3, 31), date(today.year, 6, 30),
            date(today.year, 9, 30), date(today.year, 12, 31)]
    return max((end for end in ends if end <= today),
               default=date(today.year - 1, 12, 31))


def _previous_quarter_end(period: date) -> date:
    if (period.month, period.day) not in {(3, 31), (6, 30), (9, 30), (12, 31)}:
        raise ValueError("Invalid 13F quarter")
    if period.month == 3:
        return date(period.year - 1, 12, 31)
    return {6: date(period.year, 3, 31),
            9: date(period.year, 6, 30),
            12: date(period.year, 9, 30)}[period.month]


async def _amendment_type(worker: object, filing: object) -> str:
    """SEC cover page distinguishes a replacement from additional holdings."""
    response = await worker._sec_request(filing.primary_url)
    root = ElementTree.fromstring(response.text)
    values = [str(node.text or "").strip().upper() for node in root.iter()
              if node.tag.rsplit("}", 1)[-1].lower() == "amendmenttype"]
    value = values[0] if values else ""
    if "RESTATEMENT" in value:
        return "RESTATEMENT"
    if "NEW HOLDING" in value:
        return "NEW HOLDINGS"
    raise ValueError("Unclassified SEC 13F amendment")


def _previous_holdings(store: InstitutionStore, cik: str, period: date) -> list[InstitutionHolding]:
    """Use the previous published quarter; retain original comparisons on a revision."""
    previous = store.detail(cik, _previous_quarter_end(period))
    if previous is not None:
        return [item for item in previous.holdings if item.shares > 0]
    existing = store.detail(cik, period)
    if existing is None:
        return []
    return [item.model_copy(update={
        "shares": item.previous_shares, "value": item.previous_value,
    }) for item in existing.holdings if item.previous_shares > 0]


def _direct_detail(store: InstitutionStore, period: date, cik: str,
                   pending: dict[str, object]) -> InstitutionDetail:
    from app.services.institutions import compare_holdings, _summary_counts

    current = [InstitutionHolding.model_validate(row) for row in pending["holdings"]]
    previous = _previous_holdings(store, cik, period)
    compared = compare_holdings(current, previous) if previous else current
    total = sum(item.value for item in current)
    prior_total = sum(item.value for item in previous)
    counts = _summary_counts(compared) if previous else dict.fromkeys(
        ("new", "increased", "reduced", "closed"), 0,
    )
    top10 = sum(sorted((item.value for item in current), reverse=True)[:10])
    summary = InstitutionSummary(
        cik=cik, name=str(pending["name"]), country=str(pending["country"]),
        report_period=period, filed_at=date.fromisoformat(str(pending["filed_at"])),
        filing_url=str(pending["filing_url"]), total_13f_value=total,
        holdings_count=len(current), previous_total_13f_value=prior_total,
        top10_concentration_percent=min(100, top10 / total * 100) if total else 0,
        new_positions_count=counts["new"], increased_positions_count=counts["increased"],
        reduced_positions_count=counts["reduced"], closed_positions_count=counts["closed"],
        comparison_available=bool(previous),
    )
    return InstitutionDetail(
        institution=summary, holdings=compared,
        previous_report_period=_previous_quarter_end(period) if previous else None,
        source_statuses=[InstitutionSourceStatus(
            source="SEC EDGAR — Form 13F-HR", status="available",
            detail="Table XML officielle vérifiée hors requête.",
            url=summary.filing_url, updated_at=datetime.now(UTC),
        )], generated_at=datetime.now(UTC),
    )


def _publish_pending(store: InstitutionStore, period: date,
                     complete: InstitutionsSnapshot, tracked: set[str],
                     *, min_coverage: float, source_partial: bool = False) -> int:
    from app.services.institutions import InstitutionService

    eligible = store.pending_manager_ciks(period) & tracked
    if period > complete.report_period and len(eligible) < math.ceil(len(tracked) * min_coverage):
        return 0
    existing: set[str] = set()
    if period == complete.report_period:
        for item in complete.institutions:
            if item.cik not in eligible and store.detail(item.cik, period) is not None:
                existing.add(item.cik)
    ciks = existing | eligible
    if not ciks:
        return 0

    def detail_for(cik: str) -> InstitutionDetail:
        if cik in eligible:
            row = store.pending_manager(period, cik)
            if row is None:
                raise ValueError("Missing staged 13F manager")
            return _direct_detail(store, period, cik, row)
        detail = store.detail(cik, period)
        if detail is None:
            raise ValueError("Missing published 13F manager")
        return detail

    # Three bounded passes trade database reads for a low peak memory footprint.
    # A complete quarter may contain millions of positions; never retain all
    # staged JSON payloads and Pydantic details in one Python process.
    summaries = [detail_for(cik).institution for cik in sorted(ciks)]
    summaries.sort(key=lambda item: item.total_13f_value, reverse=True)
    flows = InstitutionService._live_flows_grouped(
        (detail.institution, detail.holdings, False)
        for detail in (detail_for(item.cik) for item in summaries[:50])
    )
    previous_period = (complete.previous_report_period if period == complete.report_period
                       else complete.report_period)
    now = datetime.now(UTC)
    snapshot = InstitutionsSnapshot(
        institutions=summaries, report_period=period,
        previous_report_period=previous_period, generated_at=now, validated_at=now,
        period_status="published_edgar", institutions_reporting=len(summaries),
        institutions_expected=len(tracked),
        institutions_comparable=sum(item.comparison_available for item in summaries),
        top_increased=flows["increased"], top_new=flows["new"],
        top_reduced=flows["reduced"], top_closed=flows["closed"],
        sources=[InstitutionSourceStatus(
            source="SEC EDGAR — Form 13F-HR",
            status="partial" if source_partial or len(summaries) < len(tracked) else "available",
            detail=f"{len(summaries)}/{len(tracked)} gestionnaires suivis vérifiés.",
            url=SUBMISSIONS_SOURCE, updated_at=now,
        )],
    )
    published_accessions = {
        cik: set(store.published_manager_accessions(period, cik))
        for cik in existing
    }
    old_filings = {row["accession"]: row for row in store.published_filings(period)
                   if row["accession"] in published_accessions.get(row["cik"], set())}
    for cik in eligible:
        row = store.pending_manager(period, cik)
        if row is None:
            raise ValueError("Missing staged 13F manager")
        for filing in row["filings"]:
            old_filings[filing["accession"]] = filing
    manager_accessions = {
        cik: (store.pending_accessions(period, cik) if cik in eligible
              else store.published_manager_accessions(period, cik))
        for cik in ciks
    }
    store.publish(snapshot, (detail_for(item.cik) for item in summaries),
                  filings=list(old_filings.values()),
                  manager_accessions=manager_accessions)
    return len(summaries)


async def collect_recent_13f(store: InstitutionStore, *, worker: object | None = None,
                             limit: int = 100, min_coverage: float = 0.95) -> CollectionResult:
    """Stage verified EDGAR holdings daily; publish one period only at coverage threshold."""
    from app.services.institutions import (
        InstitutionService, _aggregate_holdings, _country_from_submissions, _filings,
    )

    complete = await asyncio.to_thread(store.latest_snapshot)
    if complete is None or complete.report_period is None:
        return CollectionResult(0, 0, 0, None, 0)
    run_id = str(uuid.uuid4())
    if not await asyncio.to_thread(store.start_run, run_id, SUBMISSIONS_SOURCE):
        raise RuntimeError("An institution ingestion is already running")
    service = worker or InstitutionService()
    tracked = await asyncio.to_thread(store.reference_manager_ciks, limit)
    tracked.update(item.cik for item in complete.institutions[:limit])
    maximum = _latest_closed_quarter(datetime.now(UTC).date())
    checked = failed = staged = 0
    published: date | None = None
    reporting = 0
    try:
        # A bounded sequential scan uses the existing five-requests/second SEC limiter.
        for cik in sorted(tracked):
            checked += 1
            try:
                submissions, stale = await service.get_submissions(cik, force_refresh=True)
                if stale:
                    raise RuntimeError("Stale SEC submissions")
                filings = [item for item in _filings(submissions)
                           if complete.report_period <= item.report_period <= maximum]
                discovered = [dict(
                    accession=item.accession, cik=cik,
                    period=item.report_period.isoformat(), form=item.form,
                    amendment_type="unclassified" if item.form.endswith("/A") else "",
                    filed_at=item.filed_at.isoformat(), source_url=item.filing_url,
                ) for item in filings]
                await asyncio.to_thread(store.record_discovered_filings, discovered)
                periods = sorted({item.report_period for item in filings})
                for period in periods:
                    ordered = sorted((item for item in filings if item.report_period == period),
                                     key=lambda item: (item.filed_at, item.accession))
                    accessions = sorted(item.accession for item in ordered)
                    pending_accessions = await asyncio.to_thread(store.pending_accessions, period, cik)
                    published_accessions = await asyncio.to_thread(
                        store.published_manager_accessions, period, cik,
                    )
                    if accessions == pending_accessions or accessions == published_accessions:
                        continue
                    if (period == complete.report_period
                        and not pending_accessions
                        and not published_accessions
                        and all(item.filed_at < (complete.validated_at or complete.generated_at).date()
                                for item in ordered)):
                        continue
                    effective: list[object] = []
                    classified: dict[str, str] = {}
                    for filing in ordered:
                        if filing.form == "13F-HR":
                            effective = [filing]
                            classified[filing.accession] = ""
                        else:
                            amendment = await _amendment_type(service, filing)
                            classified[filing.accession] = amendment
                            if amendment == "RESTATEMENT":
                                effective = [filing]
                            elif effective:
                                effective.append(filing)
                    if not effective:
                        continue
                    tables = []
                    for filing in effective:
                        holdings, table_stale = await service.fetch_13f_information_table(
                            filing, force_refresh=True,
                        )
                        if table_stale or not holdings:
                            raise RuntimeError("Unverified SEC information table")
                        tables.extend(holdings)
                    merged = list(_aggregate_holdings(tables).values())
                    latest = effective[-1]
                    filing_rows = [dict(
                        accession=item.accession, cik=cik, period=period.isoformat(),
                        form=item.form, amendment_type=classified[item.accession],
                        filed_at=item.filed_at.isoformat(), source_url=item.filing_url,
                    ) for item in effective]
                    payload = dict(
                        name=str(submissions.get("name") or cik),
                        country=_country_from_submissions(submissions),
                        filed_at=latest.filed_at.isoformat(), filing_url=latest.filing_url,
                        holdings=[item.model_dump(mode="json") for item in merged],
                        filings=filing_rows,
                    )
                    if await asyncio.to_thread(store.stage_manager, period, cik, accessions, payload):
                        staged += 1
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001
                failed += 1
                logger.warning("institution_collection_cik_failed cik=%s category=%s",
                               cik, type(error).__name__)
        candidates = await asyncio.to_thread(
            store.pending_publication_periods, complete.report_period,
            complete.validated_at or complete.generated_at,
        )
        for period in candidates:
            if period > maximum:
                continue
            count = await asyncio.to_thread(
                _publish_pending, store, period, complete, tracked,
                min_coverage=min_coverage, source_partial=failed > 0,
            )
            if count:
                published, reporting = period, count
                complete = await asyncio.to_thread(store.latest_snapshot)
        await asyncio.to_thread(store.finish_run, run_id, period=published,
                                institutions_count=reporting or staged,
                                error_category="PartialSEC" if failed and not published else None)
        return CollectionResult(checked, failed, staged, published, reporting)
    except BaseException as error:
        await asyncio.to_thread(store.finish_run, run_id, period=None,
                                institutions_count=staged,
                                error_category=type(error).__name__)
        raise


async def discover_recent_13f(
    store: InstitutionStore,
    *,
    worker: object | None = None,
    limit: int = 100,
) -> DiscoveryResult:
    """Read submissions metadata only; full holdings come from the dataset job."""
    from app.services.institutions import InstitutionService, _filings

    snapshot = await asyncio.to_thread(store.latest_snapshot)
    if snapshot is None or snapshot.report_period is None:
        return DiscoveryResult(0, 0, 0, None)
    run_id = str(uuid.uuid4())
    if not await asyncio.to_thread(store.start_run, run_id, SUBMISSIONS_SOURCE):
        return DiscoveryResult(0, 0, 0, snapshot.partial_report_period)
    service = worker or InstitutionService()
    semaphore = asyncio.Semaphore(2)
    failures = 0
    staged: list[dict[str, str]] = []

    async def check(cik: str) -> None:
        nonlocal failures
        async with semaphore:
            try:
                submissions, _ = await service.get_submissions(cik, force_refresh=True)
                for filing in _filings(submissions):
                    if filing.report_period < snapshot.report_period:
                        continue
                    staged.append({
                        "accession": filing.accession,
                        "cik": cik,
                        "period": filing.report_period.isoformat(),
                        "form": filing.form,
                        "amendment_type": "unclassified" if filing.form.endswith("/A") else "",
                        "filed_at": filing.filed_at.isoformat(),
                        "source_url": filing.filing_url,
                    })
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001
                failures += 1
                logger.warning("institution_discovery_cik_failed cik=%s category=%s", cik, type(error).__name__)

    ciks = [item.cik for item in snapshot.institutions[:limit]]
    try:
        await asyncio.gather(*(check(cik) for cik in ciks))
        inserted = await asyncio.to_thread(store.record_discovered_filings, staged)
        partial, _, _ = await asyncio.to_thread(
            store.partial_coverage,
            snapshot.report_period,
            (snapshot.validated_at or snapshot.generated_at).date(),
        )
        await asyncio.to_thread(
            store.finish_run, run_id, period=snapshot.report_period,
            institutions_count=len(ciks) - failures,
            error_category="PartialSEC" if failures else None,
        )
        logger.info(
            "institution_discovery checked=%s failed=%s new_filings=%s partial_period=%s",
            len(ciks), failures, inserted, partial,
        )
        return DiscoveryResult(len(ciks), failures, inserted, partial)
    except BaseException as error:
        await asyncio.to_thread(
            store.finish_run, run_id, period=snapshot.report_period,
            institutions_count=0, error_category=type(error).__name__,
        )
        raise


async def maintain_recent_13f(store: InstitutionStore) -> None:
    """Daily checks, every six hours during the 45-day filing window."""
    await asyncio.sleep(300)
    while True:
        try:
            await discover_recent_13f(store)
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001
            logger.warning("institution_discovery_failed category=%s", type(error).__name__)
        today = datetime.now(UTC).date()
        quarter_ends = [
            date(today.year, month, day)
            for month, day in ((3, 31), (6, 30), (9, 30), (12, 31))
            if date(today.year, month, day) <= today
        ]
        if not quarter_ends:
            quarter_ends = [date(today.year - 1, 12, 31)]
        days_since = (today - max(quarter_ends)).days
        await asyncio.sleep(6 * 3600 if days_since <= 45 else 24 * 3600)
