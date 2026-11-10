"""Bounded, request-independent discovery of recent SEC Form 13F filings."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

from app.services.institution_store import InstitutionStore


logger = logging.getLogger("anatole.api.institutions.collector")
SUBMISSIONS_SOURCE = "https://data.sec.gov/submissions/"


@dataclass(frozen=True)
class DiscoveryResult:
    checked: int
    failed: int
    new_filings: int
    latest_partial_period: date | None


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
