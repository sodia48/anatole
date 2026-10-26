# Focus Intelligence 2.0 — Résumé+ examples and limits

The examples below are outputs of `NewsBriefService.build_from_text` using test fixtures. Their figures are **synthetic test data**, not reported 5N Plus results or verified production coverage. The simulated issuer page follows the allowlisted public-release URL shape; the test does not fetch that page.

## Detailed issuer publication fixture

Input: a short, English, four-sentence simulated 5N Plus release about second-quarter revenue, growth, adjusted gross margin, and a later reporting date. The local run yields:

- **L'essentiel** (original English, because no translation provider is used in this deterministic example): “5N Plus reported revenue of USD 122.4 million for Q2 2026. Revenue increased 28% from USD 95.3 million in Q2 2025.”
- **Revenue series:** USD 122.4 million (2026) and USD 95.3 million (2025). Each row retains its own source sentence. The 28% change has no standalone period because the source sentence names only the comparison period.
- **Adjusted gross margin series:** 30.3% (2026) and 34.6% (2025), with the same source sentence visible as evidence for both rows.
- **À surveiller:** a third-quarter reporting date in November 2026. This sentence is not repeated in the lead.
- **Impact:** absent. The fixture contains no sourced link to debt, dividends, valuation or future revenue.

The unit, nature, period and supporting passage remain in each `NewsBriefFigure`. An inaccessible article with only a title returns `availability=limited`, no fabricated analysis, and a link to the original source. A publisher excerpt can be summarized as an excerpt even when the full article is inaccessible.

## Translation behavior

When an approved provider is available, the existing translation route requests a factual translation and compares every number, scale, currency and percent sign with the source. It now also rejects a response that remains clearly in the wrong language or adds interpretation to an empty source field. If validation or the provider fails, the reader keeps the original language and shows one provenance notice. These tests do not establish that a provider is available in production.

## Source boundary

The article fetcher accepts only configured official or release domains, rejects redirects to unapproved hosts and private addresses, and caps the response. This PR adds a scoped parser for public 5N Plus release pages. Yahoo search links and arbitrary publisher pages continue to use only their supplied excerpts. No paywall bypass or unlicensed body extraction is added.
