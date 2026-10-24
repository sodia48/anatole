# Financial dashboard recovery

## Root cause

The Focus financial overview rendered a fixed set of eight TTM cards and three secondary groups even when most values were absent. This produced large fields of `N/D` and hid the few verified figures among unavailable ones. It also formatted TTM amounts with the snapshot currency rather than the TTM record's own currency when these differed.

## Changes

- Select up to six available TTM metrics, with ordering that favors bank metrics for financial issuers and operating metrics for other sectors.
- Keep other reported metrics in a separate disclosure. Hide empty secondary groups and move missing observations to a compact disclosure with source, history, publication, comparability, or calculation reasons.
- Preserve the data and chart views, exact numeric formatting, source freshness warning, and original financial values.
- Use the TTM record currency for its amounts. No value is filled or estimated by the UI.
- Load the detailed metric selection on demand to keep the existing JavaScript budget; core verified figures remain visible if that optional module fails.

## Evidence

The same partial issuer fixture is shown before and after on [desktop](before-desktop.png), [mobile](before-mobile.png), [desktop after](after-desktop.png), and [mobile after](after-mobile.png). The screenshots were inspected visually. The before view showed five unavailable TTM cards and two entirely unavailable secondary groups. The after view shows three verified TTM figures, one populated secondary group, and a disclosure for the 19 missing observations.

## Validation

- `tests/e2e/focus-dashboard-quality.spec.ts`: eight passes across desktop and Pixel 7, covering partial data, bank priorities, an unavailable source and optional-module failure.
- Web typecheck, lint (six pre-existing warnings), production build, performance budget (`2,209,642` JS bytes against `2,209,777` after PR A), and `git diff --check` passed.

## Remaining limits

The missing-data reasons are derived from the currently available snapshot metadata. They distinguish a known upstream failure from insufficient history and unpublished values, but cannot attribute every absent vendor field to a precise filing. The screenshot fixture uses a mocked fundamentals response; it is not proof of the live deployment.
