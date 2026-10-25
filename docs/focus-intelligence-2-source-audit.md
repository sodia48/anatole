# Focus Intelligence 2.0 — source and reuse audit

## Existing paths

- `stock_news.py` remains the stock news collector and cache. Yahoo Finance search supplies links, publisher names, dates and occasional excerpts. Its `relatedTickers` field is only a search hint; headlines must independently establish relevance.
- `news_brief.py` remains the sole article brief pipeline. `NewsIntelligenceReader` remains its UI. This PR does not create another summarizer.
- `FocusFundamentals` and `FocusWorkspace` remain the financial data and page composition paths for the later Focus PR.
- Canada 360's government news service in `news.py` is separate from issuer news and has different source permissions.

## Visual reference

The nine-page user reference is an image-only print of a TD stock page. Pages 1–6 show a clear sequence: quote and chart, compact quote metrics, recent news, returns, earnings trends, analyst targets, grouped statistics, and peers. Pages 7–9 mostly contain the printout's sidebar. The accompanying Anatole capture shows nine valuation cards in one row and five equal-weight news cards. The later Focus Premium PR should improve information hierarchy and mobile reading without reproducing the reference's graphics, figures, proprietary text or locked features.

## Source policy and limits

| Source | Current use | Limit |
| --- | --- | --- |
| Yahoo Finance search | Discovery metadata and snippets returned by the existing endpoint | No arbitrary article crawling; publisher text stays at the supplied excerpt. Coverage and image rights vary by publisher. |
| [Canadian Natural releases](https://www.cnrl.com/investors/news-releases/) | Official title, date and PDF link | PDF content is not reproduced by the stock-news index. |
| [Enbridge releases](https://www.enbridge.com/media-center/news) | Official title, date, short public intro and link | Index parsing fails closed when structure changes. |
| [5N Plus press releases](https://www.5nplus.com/en/news/press-releases/) | Official title, date, short public intro and link | Only the public press-release index is read; article bodies and the unrelated 5N+ news list are excluded. |
| [TD Stories](https://stories.td.com/ca/en/news) | No direct crawler in this PR | Its broad news list mixes investor releases, insurance, asset management and general stories. A verified issuer-only adapter and reuse rights need further review. TD can still appear through the existing Yahoo discovery path. |

Public access or `robots.txt` does not itself grant content reuse rights. All links open the original publisher site. This implementation does not bypass paywalls or claim production coverage for sources only tested with fixtures. A failed secondary official index leaves independently sourced Yahoo items available.

## Contract introduced by News Coverage

The stock news endpoint returns a cached event list with `page`, `page_size`, `total_items` and `has_more`. The server filters by `direct`, `sector`, `market` or `official` before slicing. The default page includes all 72 possible events so existing Focus clients continue to receive the full snapshot; new clients can request smaller pages. The legacy item fields remain; `related_sources` preserves distinct publishers covering one event. Numeric amounts, quarter labels, dates and event types constrain grouping so separate announcements remain distinct.

The `market` tier is emitted only for a small explicit set of economic links; it is never inferred from a ticker in `relatedTickers` alone. The editorial panel and its before/after captures are part of the later Focus Premium PR.
