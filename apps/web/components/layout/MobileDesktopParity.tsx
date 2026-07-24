"use client";

const MOBILE_DESKTOP_PARITY_CSS = String.raw`
.mobile-menu-toggle,
.mobile-sidebar-backdrop,
.mobile-sidebar-header,
.mobile-drawer-close {
  display: none;
}

@media (max-width: 900px) {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  body {
    min-height: 100dvh;
  }

  .app-shell {
    display: block !important;
    width: 100% !important;
    min-height: 100dvh !important;
  }

  .app-main {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding:
      calc(68px + env(safe-area-inset-top, 0px))
      10px
      calc(24px + env(safe-area-inset-bottom, 0px))
      !important;
    overflow-x: hidden !important;
  }

  /*
   * Complete desktop navigation, reorganized as a proper mobile drawer.
   * Explicit grid/flex resets prevent the inherited desktop placement seen
   * in the previous version.
   */
  .sidebar {
    position: fixed !important;
    inset: 0 auto 0 0 !important;
    z-index: 1001 !important;
    width: min(calc(100vw - 46px), 326px) !important;
    min-width: 0 !important;
    max-width: 326px !important;
    height: 100dvh !important;
    margin: 0 !important;
    padding:
      env(safe-area-inset-top, 0px)
      12px
      calc(16px + env(safe-area-inset-bottom, 0px))
      !important;
    display: flex !important;
    grid-template-columns: none !important;
    grid-template-rows: none !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
    border: 0 !important;
    border-right: 1px solid var(--border) !important;
    border-radius: 0 22px 22px 0 !important;
    background: rgba(4, 13, 21, 0.99) !important;
    box-shadow: 24px 0 72px rgba(0, 0, 0, 0.52) !important;
    transform: translate3d(-106%, 0, 0);
    transition: transform 180ms ease;
  }

  .sidebar.is-mobile-open {
    transform: translate3d(0, 0, 0);
  }

  .sidebar > *,
  .sidebar nav,
  .sidebar div,
  .sidebar a,
  .sidebar button {
    grid-column: auto !important;
    grid-row: auto !important;
    transform: none;
  }

  .mobile-sidebar-header {
    position: sticky;
    top: 0;
    z-index: 2;
    width: 100%;
    min-height: 68px;
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0 8px;
    background:
      linear-gradient(
        180deg,
        rgba(4, 13, 21, 1) 72%,
        rgba(4, 13, 21, 0)
      );
  }

  .sidebar .desktop-sidebar-brand {
    display: none !important;
  }

  .sidebar .brand {
    position: static !important;
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex: 1 1 auto !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 9px !important;
    color: var(--text) !important;
    text-decoration: none !important;
  }

  .sidebar .brand-mark {
    width: 42px !important;
    height: 42px !important;
    min-width: 42px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 12px !important;
    font-size: 24px !important;
    line-height: 1 !important;
  }

  .sidebar .brand > span:not(.brand-mark) {
    display: inline !important;
    min-width: 0;
    font-size: 25px !important;
    font-weight: 800 !important;
    line-height: 1 !important;
  }

  .sidebar .brand > small {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    min-height: 23px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 9px !important;
    line-height: 1;
    text-transform: uppercase;
  }

  .mobile-drawer-close {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: grid !important;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: rgba(9, 29, 43, 0.94);
    color: var(--text);
    cursor: pointer;
  }

  .sidebar .sidebar-search {
    position: static !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 43px !important;
    margin: 5px 0 13px !important;
    padding: 0 11px !important;
    display: grid !important;
    grid-template-columns: 20px minmax(0, 1fr) auto !important;
    align-items: center !important;
    justify-content: stretch !important;
    gap: 9px !important;
    border-radius: 11px !important;
    text-align: left !important;
  }

  .sidebar .sidebar-search > span,
  .sidebar .sidebar-search > kbd {
    display: inline !important;
  }

  .sidebar .sidebar-search > kbd {
    justify-self: end;
  }

  .sidebar .desktop-nav,
  .sidebar .sidebar-nav {
    position: static !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 0 8px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-content: start !important;
    gap: 15px !important;
    overflow: visible !important;
  }

  .sidebar .nav-group {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 4px !important;
  }

  .sidebar .nav-group-label {
    display: block !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 2px 8px 5px !important;
    font-size: 9px !important;
    letter-spacing: 0.14em !important;
  }

  .sidebar .nav-item {
    position: static !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 43px !important;
    margin: 0 !important;
    padding: 9px 10px !important;
    display: grid !important;
    grid-template-columns: 22px minmax(0, 1fr) auto !important;
    align-items: center !important;
    justify-content: stretch !important;
    gap: 9px !important;
    border-radius: 10px !important;
    text-align: left !important;
    white-space: normal !important;
  }

  .sidebar .nav-item > svg {
    width: 18px !important;
    min-width: 18px !important;
    justify-self: center;
  }

  .sidebar .nav-item > span {
    display: block !important;
    min-width: 0 !important;
    overflow: hidden !important;
    font-size: 13px !important;
    line-height: 1.25 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .sidebar .nav-item > em {
    display: inline !important;
    justify-self: end;
    font-size: 7px !important;
    white-space: nowrap !important;
  }

  .sidebar .mobile-nav {
    display: none !important;
  }

  .sidebar .sidebar-footer {
    width: 100% !important;
    margin: auto 0 0 !important;
    padding: 14px 8px 4px !important;
    display: grid !important;
    gap: 5px !important;
  }

  .mobile-menu-toggle {
    position: fixed;
    top: calc(11px + env(safe-area-inset-top, 0px));
    left: 11px;
    z-index: 1003;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: rgba(7, 22, 34, 0.97);
    color: var(--text);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(18px);
    cursor: pointer;
  }

  .mobile-menu-toggle.is-drawer-open {
    visibility: hidden;
    pointer-events: none;
  }

  .mobile-sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: block;
    width: 100vw;
    height: 100dvh;
    margin: 0;
    padding: 0;
    border: 0;
    background: rgba(0, 6, 11, 0.7);
    backdrop-filter: blur(3px);
    cursor: pointer;
  }

  .mobile-sidebar-backdrop[hidden] {
    display: none !important;
  }

  .panel {
    max-width: 100% !important;
    border-radius: 16px !important;
  }

  .cockpit-page,
  .focus-page,
  .screener-page,
  .news-page,
  .calendar-page,
  .watchlist-page,
  .psychology-page,
  .preferences-page,
  .roadmap-page {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    gap: 12px !important;
    overflow-x: hidden !important;
  }

  .cockpit-header,
  .quote-header {
    width: 100% !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 15px !important;
  }

  .cockpit-header h1,
  .quote-header h1 {
    margin-top: 7px !important;
    font-size: clamp(27px, 8vw, 39px) !important;
  }

  .cockpit-header p,
  .quote-header p {
    font-size: 11px !important;
    line-height: 1.45 !important;
  }

  .cockpit-market-score,
  .quote-meta {
    min-width: 82px;
    justify-content: flex-end !important;
    text-align: right !important;
  }

  .cockpit-market-score strong {
    font-size: clamp(23px, 7vw, 32px) !important;
  }

  .cockpit-market-score small {
    max-width: 105px;
    font-size: 8px !important;
    line-height: 1.35 !important;
  }

  .price-line {
    flex-wrap: wrap;
  }

  /*
   * True mobile KPI grid: all four values are visible and no card is cut.
   */
  .cockpit-kpis,
  [class*="metricGrid"] {
    width: 100% !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-auto-flow: row !important;
    grid-auto-columns: auto !important;
    gap: 9px !important;
    overflow: visible !important;
    padding: 0 !important;
  }

  .cockpit-kpi,
  [class*="metricGrid"] > * {
    min-width: 0 !important;
    min-height: 92px !important;
    padding: 13px !important;
  }

  .cockpit-kpi strong {
    font-size: 27px !important;
  }

  /*
   * Cockpit lower modules stack cleanly instead of remaining a 956px rail.
   */
  .cockpit-lower-grid,
  .cockpit-movers-grid {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 11px !important;
    overflow: visible !important;
  }

  .sector-list,
  .movers-list {
    min-width: 0 !important;
  }

  /*
   * Focus keeps every desktop module, but the analytics column moves below
   * the chart. The chart itself uses the phone width.
   */
  .focus-grid {
    width: 100% !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 12px !important;
  }

  .chart-toolbar {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .chart-toolbar::-webkit-scrollbar {
    display: none;
  }

  .chart-canvas {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    min-height: 390px !important;
    height: clamp(420px, 112vw, 560px) !important;
    overflow: hidden !important;
  }

  .right-column {
    width: 100% !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 11px !important;
  }

  /*
   * Tables keep all data through local horizontal scrolling only.
   */
  .table-wrap,
  .trade-table,
  [class*="tradeTable"],
  [class*="tableWrap"],
  [class*="tableContainer"],
  [class*="financialTable"],
  [class*="statementTable"] {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
  }

  table {
    min-width: max-content;
  }

  /*
   * IPO/insider sections remain visually identical, with responsive grids.
   */
  [class*="sectionPanel"],
  [class*="sourcesPanel"] {
    width: 100% !important;
    max-width: 100% !important;
    overflow: hidden !important;
  }

  [class*="ipoGrid"] {
    width: 100% !important;
    min-width: 0 !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [class*="sourceGrid"] {
    width: 100% !important;
    min-width: 0 !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [class*="flowPanel"] {
    width: 100% !important;
    min-width: 0 !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  [class*="filters"],
  [class*="insiderControls"] {
    width: 100% !important;
    min-width: 0 !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [class*="mainTabs"] {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .period-tabs,
  .range-tabs,
  .filters-row,
  .filter-bar,
  [class*="periodTabs"],
  [class*="rangeTabs"],
  [class*="toolbar"] {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    flex-wrap: nowrap !important;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .period-tabs::-webkit-scrollbar,
  .range-tabs::-webkit-scrollbar,
  .filters-row::-webkit-scrollbar,
  .filter-bar::-webkit-scrollbar,
  [class*="periodTabs"]::-webkit-scrollbar,
  [class*="rangeTabs"]::-webkit-scrollbar,
  [class*="toolbar"]::-webkit-scrollbar {
    display: none;
  }

  input,
  select,
  textarea {
    max-width: 100%;
    min-height: 42px;
    font-size: 16px;
  }

  .desktop-only,
  [data-desktop-only="true"] {
    display: revert !important;
  }

  svg,
  canvas {
    max-width: 100%;
    touch-action: pan-y;
  }
}

@media (max-width: 520px) {
  .app-main {
    padding-right: 8px !important;
    padding-left: 8px !important;
  }

  .cockpit-header,
  .quote-header {
    padding: 13px !important;
  }

  .cockpit-header p {
    display: none;
  }

  [class*="hero"] {
    align-items: flex-start !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [class*="heroMetrics"] {
    width: 100% !important;
    justify-content: flex-start !important;
    text-align: left !important;
  }

  [class*="heroMetrics"] > div {
    justify-items: start !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar {
    transition: none !important;
  }
}
`;

export function MobileDesktopParity() {
  return (
    <style
      data-anatole-mobile-responsive-v2
      dangerouslySetInnerHTML={{
        __html: MOBILE_DESKTOP_PARITY_CSS,
      }}
    />
  );
}
