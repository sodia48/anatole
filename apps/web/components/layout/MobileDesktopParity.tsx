"use client";

const MOBILE_DESKTOP_PARITY_CSS = String.raw`
/*
 * Anatole mobile parity layer
 * Keeps the same information architecture and visual hierarchy as desktop.
 * Mobile uses compact dimensions and local horizontal rails instead of
 * replacing sections with simplified mobile-only versions.
 */

.mobile-menu-toggle,
.mobile-sidebar-backdrop {
  display: none;
}

@media (max-width: 900px) {
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
    min-height: 100dvh !important;
  }

  .app-main {
    width: 100% !important;
    min-width: 0 !important;
    padding:
      calc(66px + env(safe-area-inset-top, 0px))
      12px
      calc(24px + env(safe-area-inset-bottom, 0px))
      !important;
  }

  /* Full desktop navigation in a mobile drawer. */
  .sidebar {
    position: fixed !important;
    inset: 0 auto 0 0 !important;
    z-index: 1001 !important;
    width: min(88vw, 310px) !important;
    height: 100dvh !important;
    padding:
      calc(18px + env(safe-area-inset-top, 0px))
      14px
      calc(18px + env(safe-area-inset-bottom, 0px))
      !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    border-right: 1px solid var(--border) !important;
    border-radius: 0 20px 20px 0 !important;
    background: rgba(5, 13, 21, 0.985) !important;
    box-shadow: 26px 0 70px rgba(0, 0, 0, 0.42) !important;
    transform: translateX(-106%);
    transition: transform 180ms ease;
    overscroll-behavior: contain;
  }

  .sidebar.is-mobile-open {
    transform: translateX(0);
  }

  .sidebar .brand {
    display: flex !important;
    padding: 0 8px 18px !important;
  }

  .sidebar .brand > span,
  .sidebar .brand > small,
  .sidebar .nav-item > span,
  .sidebar .nav-group-label,
  .sidebar .sidebar-footer {
    display: initial !important;
  }

  .sidebar .sidebar-search {
    display: flex !important;
  }

  .sidebar .desktop-nav,
  .sidebar .sidebar-nav {
    display: grid !important;
    width: 100% !important;
  }

  .sidebar .nav-item {
    justify-content: flex-start !important;
    min-height: 43px !important;
    padding: 10px 11px !important;
  }

  .sidebar .nav-item > svg {
    flex: 0 0 auto;
  }

  .sidebar .mobile-nav {
    display: none !important;
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
    background: rgba(7, 22, 34, 0.96);
    color: var(--text);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(18px);
    cursor: pointer;
  }

  .mobile-menu-toggle:focus-visible {
    outline: 2px solid rgba(86, 152, 255, 0.9);
    outline-offset: 2px;
  }

  .mobile-sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: block;
    border: 0;
    background: rgba(0, 6, 11, 0.66);
    backdrop-filter: blur(3px);
    cursor: pointer;
  }

  .mobile-sidebar-backdrop[hidden] {
    display: none !important;
  }

  /* Same panel language as desktop. */
  .panel {
    border-radius: 17px !important;
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
    max-width: none !important;
    gap: 12px !important;
  }

  /* Desktop-style headers remain horizontal. */
  .cockpit-header,
  .quote-header {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 16px !important;
  }

  .cockpit-header h1,
  .quote-header h1 {
    font-size: clamp(28px, 8vw, 43px) !important;
  }

  .cockpit-market-score,
  .quote-meta {
    justify-content: flex-end !important;
    text-align: right !important;
  }

  .price-line {
    flex-wrap: wrap;
  }

  /* KPI rows stay rows, as on desktop. */
  .cockpit-kpis,
  [class*="metricGrid"] {
    display: grid !important;
    grid-template-columns: none !important;
    grid-auto-flow: column !important;
    grid-auto-columns: minmax(155px, 1fr) !important;
    gap: 10px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    padding-bottom: 4px;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }

  .cockpit-kpis > *,
  [class*="metricGrid"] > * {
    scroll-snap-align: start;
  }

  /*
   * Complex desktop sections preserve their desktop columns inside a local
   * horizontal rail. Nothing is removed and the whole page does not become
   * one giant horizontal canvas.
   */
  .focus-grid {
    grid-template-columns: minmax(720px, 1fr) 330px !important;
    min-width: 1066px !important;
  }

  .focus-page:has(.focus-grid) {
    overflow-x: auto !important;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
  }

  .chart-toolbar {
    align-items: center !important;
    flex-direction: row !important;
    min-width: 720px;
  }

  .chart-canvas {
    width: 100% !important;
    min-width: 720px !important;
    min-height: 500px !important;
    height: min(72vh, 760px) !important;
  }

  .right-column {
    grid-template-columns: 1fr !important;
  }

  .cockpit-lower-grid {
    grid-template-columns: minmax(620px, 1fr) 320px !important;
    min-width: 956px !important;
  }

  .cockpit-page:has(.cockpit-lower-grid) {
    overflow-x: auto !important;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
  }

  .cockpit-movers-grid {
    grid-template-columns: repeat(2, minmax(300px, 1fr)) !important;
  }

  /* Tables retain every desktop column. */
  .table-wrap,
  .trade-table,
  [class*="tradeTable"],
  [class*="tableWrap"],
  [class*="tableContainer"],
  [class*="financialTable"],
  [class*="statementTable"] {
    max-width: 100%;
    overflow-x: auto !important;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
  }

  table {
    min-width: max-content;
  }

  /* CSS-module pages: preserve desktop grids in scrollable rails. */
  [class*="sectionPanel"],
  [class*="sourcesPanel"] {
    overflow-x: auto !important;
    overscroll-behavior-x: contain;
  }

  [class*="ipoGrid"] {
    grid-template-columns: repeat(3, minmax(280px, 1fr)) !important;
    min-width: 870px !important;
  }

  [class*="sourceGrid"] {
    grid-template-columns: repeat(3, minmax(225px, 1fr)) !important;
    min-width: 720px !important;
  }

  [class*="flowPanel"] {
    grid-template-columns: repeat(4, minmax(175px, 1fr)) !important;
    min-width: 720px !important;
  }

  [class*="filters"] {
    grid-template-columns:
      minmax(330px, 1fr)
      210px
      210px
      !important;
    min-width: 780px !important;
  }

  [class*="insiderControls"] {
    grid-template-columns:
      minmax(430px, 1fr)
      190px
      170px
      190px
      !important;
    min-width: 1010px !important;
  }

  [class*="mainTabs"] {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  /* Filters and period tabs remain compact horizontal toolbars. */
  .period-tabs,
  .range-tabs,
  .filters-row,
  .filter-bar,
  [class*="periodTabs"],
  [class*="rangeTabs"],
  [class*="toolbar"] {
    max-width: 100%;
    overflow-x: auto;
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
  textarea,
  button {
    font-size: max(16px, 1em);
  }

  input,
  select,
  textarea {
    min-height: 42px;
  }

  /* Avoid accidental disappearance caused by legacy mobile CSS. */
  .desktop-only,
  [data-desktop-only="true"] {
    display: revert !important;
  }

  /* Touch behavior: scroll, no involuntary chart zoom. */
  svg,
  canvas {
    touch-action: pan-x pan-y;
  }
}

@media (max-width: 560px) {
  .app-main {
    padding-right: 9px !important;
    padding-left: 9px !important;
  }

  .cockpit-header,
  .quote-header {
    gap: 10px !important;
    padding: 14px !important;
  }

  .cockpit-market-score strong {
    font-size: 25px !important;
  }

  .panel {
    border-radius: 15px !important;
  }

  [class*="hero"] h1 {
    font-size: clamp(27px, 9vw, 38px) !important;
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
      data-anatole-mobile-desktop-parity
      dangerouslySetInnerHTML={{
        __html: MOBILE_DESKTOP_PARITY_CSS,
      }}
    />
  );
}
