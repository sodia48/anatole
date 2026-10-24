# News Intelligence V2

`/actualites`, Focus stock news and the native article screen call the same
`POST /api/v1/discovery/news/brief` service. The API keeps its original request
and response fields. Additional context identifies the company, language and
content version; the server cache keys the full request.

The web surfaces share `NewsIntelligenceReader`, which opens without leaving
the page, cancels obsolete requests and restores keyboard focus on close. The
native reader uses the same API contract above its existing original-source
WebView. The reading mode expands only when the brief contains grounded detail.

The brief extracts facts from an allowlisted public page when it can verify
that the page concerns the selected article. Otherwise it uses the supplied
publisher excerpt or title and labels the coverage accordingly. Redirects are
checked against the allowlist, responses are capped, and blocked or inaccessible
pages are never represented as articles read. Figures retain their source
sentence and distinguish reported data, forecasts and analyst opinions.
Dates announced in the source are also kept as dated observations.
Translation uses the existing provider router only when available, checks all
numeric tokens against the source, and keeps the original text with an explicit
notice if it cannot verify the translation.

## Example from deterministic test fixtures

Before, the Focus reader displayed the feed text alone. For a CNQ result it
could only show “The company reported revenue of $10 billion in the quarter.”
Now both surfaces show that fact as the essential summary, `$10 billion` as a
reported figure with its source sentence, and “Publisher excerpt” because the
test provides only the excerpt. A title-only story shows “Limited information”
and does not repeat its title as a claimed summary. These are test fixtures,
not claims about a current company filing.

## Captures from Playwright

- [Macro reader, desktop](macro-desktop.png)
- [Macro reader, mobile viewport](macro-mobile.png)
- [CNQ in Focus, desktop](focus-cnq-desktop.png)
- [RY in Focus, sky blue theme](focus-blue-desktop.png)

The test suite covers official macro content, public stock releases, excerpts,
title-only articles, inaccessible pages, translations, factual numbers, company
relevance, cache changes, URL safety, rapid article switching, retry and focus
restoration. Publisher pages beyond the approved public hosts remain at excerpt
or title level. The user can always open the original source.
