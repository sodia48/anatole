# Anatole Mobile/Web parity report

Date: 2026-08-30  
Branch: `feat/mobile-web-parity`

## Audit matrix

| Feature | Web | Mobile before | Mobile after | Status |
|---|---|---|---|---|
| Cockpit heatmap | Binary weighted treemap | Two-column sector cards | One SVG treemap using `@anatole/shared` normalization, density weights, grouping and binary layout | Complete |
| TSX 60 | Heatmap + breadth + movers | Sector cards + 25 rows | Heatmap first, breadth and movers from the same snapshot | Complete |
| TSX Composite | Dense heatmap | Up to 25 rows rendered below sector cards | Dense `>150` layout curve; constituents available only on request | Complete |
| Sector drill-down | Sector group navigation | Missing | Tap sector header, isolated sector, explicit return to full market | Complete |
| Full market / direction | Three grouping modes | Missing | Sectors, Full market and Market direction | Complete |
| Tile details/actions | Quote detail and Focus link | Missing | Long-press detail sheet, Focus, watchlist and alert actions | Complete |
| Constituents | Secondary searchable list | Main-page rows | Virtualized `FlatList`, search and sector filter in a secondary modal | Complete |
| Movers/breadth | Advancers, decliners, unchanged, gainers, losers | Movers only | Breadth, weighted change, gainers and losers | Complete |
| Mobile News | Functional web module | Redirected to Today | Real discovery-news endpoint, bilingual cards and summaries | Complete |
| Mobile Calendar | Functional web module | “Next phase” | Real discovery-calendar endpoint | Complete |
| Screener, ETF, Institutions, IPO/insiders | Full web modules | “Next phase” | Explicit “Coming soon on mobile”; no fake screen or data | Gap documented |
| Focus architecture | Six functional sections | One large file with four minimal tabs | Small orchestrator plus Header, Navigation, Overview, Pro, Fundamentals, Financials, Analysts, Ecosystem and Actions components | Complete |
| Focus Overview | Quote, chart, technical summary, levels, news | Quote + chart + first 8 technical fields | Live quote, range chart, RSI reading, trend, support/resistance, 10 news summaries, watchlist, alerts and portfolio | Complete |
| Focus Pro | Full workstation | Local minimal canvas WebView | Specialized `/embed/focus/[ticker]` WebView backed by the existing `FocusWorkspace` | Complete |
| Timeframes/chart types | Full workstation controls | Fixed native chart modes | Native compact controls bridged to the web engine | Complete |
| Drawings | Full drawing toolbar | Missing | Native bottom sheet exposes cursor, trendline, horizontal, vertical, ray, rectangle, channel, Fib retracement/extension, measure and text; undo/redo remain visible | Complete |
| Indicators | Full configured indicator catalogue | `Object.entries(...).slice(0, 8)` | Full web indicator panel in Pro; native overview is a reading summary only | Complete |
| Compare | Focus web panel | Missing | Bridge opens existing comparison panel | Complete |
| Alerts | Price/indicator/drawing/strategy workflow | Generic route shortcut | Bridge opens existing Focus alert panel; shared synchronized workspace | Complete |
| Layouts | Shared account workspace | Missing | Same `focus_layouts`; a validated mobile session bootstraps the same HTTP-only web session | Complete |
| Fundamental overlay | Existing Focus overlay | Missing | Bridge toggles the existing overlay | Complete |
| Strategy / Backtest / Anatole Script | Existing panels and backend | Missing | Existing Strategy Lab, backtest and script engine reused inside embed | Complete |
| Paper Trading | Existing account-isolated backend | Missing | Existing Paper panel and backend; no mobile-specific account or ledger | Complete |
| Fundamentals | Complete real snapshot | Volume/sector/day high/day low | Real `/fundamentals` snapshot: valuation, dividends, growth, profitability, debt/liquidity, cash flow, TTM and coverage/source state | Complete |
| Financials | Annual/quarterly statements | Missing | Native annual/quarterly period selector and mobile cards; no horizontal table | Complete |
| Analysts | Consensus, targets, history, estimates, events | Missing | Native consensus, distribution, targets, earnings history/estimates and dates | Complete |
| Fundamentals cache | One web resource | Not applicable | One TanStack key `fundamentals/{ticker}` reused by three lazy sections for 10 minutes | Complete |
| Ecosystem chain | Verified relationship data | Placeholder | Suppliers → company → customers → end markets plus partners/subsidiaries | Complete |
| Ecosystem network | Interactive web graph | Placeholder | Native SVG graph plus verified relation list, tappable nodes, depth control, confidence, materiality and source counts | Complete |
| Ecosystem evidence | Evidence/source views | Placeholder | Lazy evidence endpoint with excerpts and provenance | Complete |
| Ecosystem path finder | Max-depth verified path | Missing | Real path endpoint, maximum depth 3, no inferred relationship | Complete |
| Network build status | `building/ready/failed` | Missing | Status/message/retry interval and stale snapshot handling | Complete |
| Live prices | WebSocket | 15-second polling | WebSocket while foregrounded, close in background, exponential reconnect; public snapshot remains fallback | Complete |
| Orientation | Responsive web workstation | Portrait-only flow | Focus stock screen permits all orientations; embed is compact in portrait and expands in landscape | Complete |
| Shared contracts/math | Web-local definitions | Mobile-local definitions | Pure heatmap math, cockpit/fundamentals/network contracts and ticker normalization in `packages/shared` | Complete |

## Architecture and data truth

- The mobile Cockpit and web heatmap execute the same pure normalization, layout-weight, grouping, weighted-change and binary-treemap functions.
- Missing quotes are marked unavailable and render `N/D`; `null` is never converted into a displayed zero.
- Fundamentals, Financials and Analysts share a single backend snapshot and request cache.
- Company relationships come only from `company-network`, `evidence` and `path`; the mobile UI does not derive or invent edges.
- Focus Pro loads only when the Pro section is active. Native Overview, Fundamentals, Financials, Analysts and Ecosystem remain native.
- The Focus Pro session token is sent in bridge memory, never in the URL. A same-origin BFF validates it against `/account/me` and stores it as an HTTP-only cookie so Paper and synchronized layouts use the existing account.

## Performance

- The Composite heatmap is one SVG tree, not 200 shadowed React Native cards.
- The full constituent list is not mounted under the heatmap; it is a separate virtualized list with bounded render batches.
- News, fundamentals, ecosystem and evidence are lazy by section.
- TanStack Query abort signals are forwarded for Focus, fundamentals and company-network resources.
- Foreground WebSocket reconnect uses bounded exponential backoff and is closed in the background.

## Expo Go / iPhone status

- `react-native-svg` is pinned to Expo SDK 57-compatible `15.15.4`.
- No custom-development-build-only dependency was introduced.
- The iOS production bundle exported successfully through Metro: 1,931 modules, Hermes bundle 4.6 MB.
- Physical iPhone tap/long-press, Dynamic Island spacing and landscape gesture QA still require confirmation in the user's active Expo Go session; they cannot be physically exercised by the repository runner.

## Exact remaining gaps

1. Screener, ETF, Institutions and IPO/insiders still need their dedicated native migrations; their placeholders now say “Coming soon on mobile” and expose no fabricated data.

## Validation

| Validation | Result |
|---|---|
| Backend | `288 passed, 1 warning in 65.86s` |
| Web typecheck | Passed |
| Web lint | Passed |
| Web build | Passed; `/embed/focus/[ticker]` emitted as a dynamic route |
| Mobile typecheck | Passed |
| Mobile lint | Passed |
| Mobile tests | `9 suites passed, 29 tests passed` |
| iOS Expo export | Passed; 1,931 modules, 4.6 MB Hermes bundle |
| `git diff --check` | Passed |

## Parity score

27 / 28 essential feature groups complete. The remaining web market modules are explicitly documented for later native migration, as permitted for this pass.
