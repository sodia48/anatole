"""Live diagnostic for Province 360 labour and real-GDP StatCan series.

Run from the repository root with:
    python scripts/diagnose_province360_statcan.py

The command exits non-zero unless both official WDS series resolve to a
numeric value for each of Canada's ten provinces.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import httpx


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "apps" / "api"))

from app.services.provincial_statistics import (  # noqa: E402
    METRICS,
    PROVINCES,
    ProvincialStatisticsService,
    _find_dimension,
    _find_member,
    _resolve_coordinate,
)


TARGET_KEYS = ("unemployment_rate", "real_gdp")


def _selection_report(metadata: dict, spec) -> list[str]:
    dimensions = metadata.get("dimension") or metadata.get("dimensions") or []
    report: list[str] = []
    for selector in spec.selectors:
        dimension = _find_dimension(dimensions, selector.dimension_terms)
        if dimension is None:
            report.append(
                f"  dimension absent (optional={not selector.required}): "
                f"{selector.dimension_terms[0]}"
            )
            continue
        member = _find_member(dimension, selector.member_terms)
        report.append(
            "  "
            f"{dimension.get('dimensionNameEn')} "
            f"(position {dimension.get('dimensionPositionId')}) -> "
            f"{member.get('memberNameEn') if member else 'UNRESOLVED'} "
            f"(member {member.get('memberId') if member else 'N/A'})"
        )
    return report


async def main() -> int:
    service = ProvincialStatisticsService()
    timeout = httpx.Timeout(connect=4.0, read=15.0, write=4.0, pool=4.0)
    failures: list[str] = []

    async with httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": "Anatole/Province360-live-diagnostic"},
        follow_redirects=True,
    ) as client:
        for key in TARGET_KEYS:
            spec = next(item for item in METRICS if item.key == key)
            metadata = await service._metadata(client, spec.product_id)
            print(f"\n{key} · {spec.table_id} · product {spec.product_id}")
            print("Resolved selectors from live metadata:")
            print("\n".join(_selection_report(metadata, spec)))

            metrics, issue = await service._metric_for_provinces(
                client,
                spec,
                list(PROVINCES),
                "fr",
            )
            if issue:
                print(f"WDS issue: {issue}")

            for province in PROVINCES:
                code = province["code"]
                coordinate = _resolve_coordinate(metadata, spec, province)
                metric = metrics.get(code)
                value = metric.value if metric is not None else None
                period = metric.reference_period if metric is not None else None
                print(
                    f"  {code}: coordinate={coordinate or 'UNRESOLVED'} "
                    f"value={value!r} period={period or 'N/A'}"
                )
                if not isinstance(value, (int, float)):
                    failures.append(f"{key}:{code}")

    if failures:
        print("\nFAILED: " + ", ".join(failures))
        return 1
    print("\nPASS: unemployment_rate=10/10, real_gdp=10/10")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
