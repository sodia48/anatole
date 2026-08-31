"use client";

import { FlaskConical, Network, WalletCards } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";

import { useAccount } from "@/components/providers/AccountProvider";
import { CompanyEcosystem } from "@/components/company-network/CompanyEcosystem";
import { FocusRangeChart } from "@/components/chart/FocusRangeChart";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { FocusFundamentals, type FundamentalView } from "@/components/stock/FocusFundamentals";
import { KeyLevels } from "@/components/stock/KeyLevels";
import { QuoteHeader } from "@/components/stock/QuoteHeader";
import { TechnicalSummary } from "@/components/stock/TechnicalSummary";
import {
  getFocusFundamentalOverlay,
  getFocusSnapshotForRange,
  getStockHistory,
  quoteWebSocketUrl,
  runFocusBacktest,
  validateAnatoleScript,
} from "@/lib/api";
import { pick } from "@/lib/i18n";
import type {
  AlertRule,
  AnatoleScriptValidation,
  BacktestRequest,
  BacktestResult,
  FocusFundamentalOverlaySnapshot,
  FocusSnapshot,
  PaperAccount,
  Quote,
} from "@/lib/types";
import {
  readLocalWorkspace,
  WORKSPACE_SYNC_EVENT,
  writeLocalWorkspace,
} from "@/lib/workspace-sync";

import { aggregateIntraday } from "./chart/transforms";
import { drawingReducer, INITIAL_DRAWING_STATE } from "./drawings/engine";
import { FocusAlertPanel } from "./FocusAlertPanel";
import { FocusBacktestPanel } from "./FocusBacktestPanel";
import { FocusBottomPanel } from "./FocusBottomPanel";
import { FocusChart } from "./FocusChart";
import { FocusComparePanel } from "./FocusComparePanel";
import { FocusDrawingToolbar } from "./FocusDrawingToolbar";
import {
  buildFundamentalMarkers,
  FocusFundamentalOverlay,
} from "./FocusFundamentalOverlay";
import { FocusIndicatorPanel } from "./FocusIndicatorPanel";
import { FocusLayoutsPanel } from "./FocusLayoutsPanel";
import { FocusPaperTrading } from "./FocusPaperTrading";
import { FocusStrategyPanel, DEFAULT_ANATOLE_SCRIPT } from "./FocusStrategyPanel";
import { FocusToolbar } from "./FocusToolbar";
import type {
  ComparisonSeries,
  DrawingTool,
  FocusLayout,
  FocusScript,
  FundamentalMarker,
  FocusChartType,
  FocusTimeframe,
  SnapMode,
} from "./types";
import { createDefaultFocusLayout, TIMEFRAMES } from "./types";
import styles from "./FocusPro.module.css";

type Panel = "indicators" | "compare" | "alerts" | "layouts" | "strategy" | "paper" | null;
type Section = "overview" | "chart" | "ecosystem" | FundamentalView;

const SECTIONS: Array<{ id: Section; fr: string; en: string }> = [
  { id: "overview", fr: "Cours", en: "Price" },
  { id: "chart", fr: "Workstation pro", en: "Pro workstation" },
  { id: "fundamentals", fr: "Fondamentaux", en: "Fundamentals" },
  { id: "financials", fr: "Résultats", en: "Financials" },
  { id: "analysts", fr: "Analystes", en: "Analysts" },
  { id: "ecosystem", fr: "Écosystème", en: "Ecosystem" },
];

export function FocusWorkspace({ initialSnapshot, embedded = false }: { initialSnapshot: FocusSnapshot; embedded?: boolean }) {
  const { preferences, updatePreferences } = usePreferences();
  const { user, refreshAccount } = useAccount();
  const language = preferences.language;
  const ticker = initialSnapshot.quote.ticker.replace(/\.TO$/, "");
  const [section, setSection] = useState<Section>(embedded ? "chart" : "overview");
  const [clientReady, setClientReady] = useState(false);
  const [layout, setLayout] = useState(() => createDefaultFocusLayout(ticker));
  const [layouts, setLayouts] = useState<FocusLayout[]>([]);
  const [scripts, setScripts] = useState<FocusScript[]>([]);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [quote, setQuote] = useState<Quote>(initialSnapshot.quote);
  const [liveState, setLiveState] = useState<"connecting" | "live" | "offline">("connecting");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [snapMode, setSnapMode] = useState<SnapMode>("ohlc");
  const [drawingState, dispatchDrawing] = useReducer(drawingReducer, INITIAL_DRAWING_STATE);
  const [comparisons, setComparisons] = useState<ComparisonSeries[]>([]);
  const [fundamentals, setFundamentals] = useState<FocusFundamentalOverlaySnapshot | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<FundamentalMarker | null>(null);
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);
  const postNative = useCallback((payload: object) => {
    if (!embedded) return;
    window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
  }, [embedded]);
  const onPaperAccount = useCallback((value: PaperAccount | null) => {
    setPaperAccount(value);
    postNative({ type: "paperOrderChanged" });
  }, [postNative]);
  const [scriptValidation, setScriptValidation] = useState<AnatoleScriptValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestRequest, setBacktestRequest] = useState<BacktestRequest>({
    ticker,
    range: "1y",
    interval: "1d",
    strategy: "sma_crossover",
    strategy_parameters: { fast: 20, slow: 50 },
    script: DEFAULT_ANATOLE_SCRIPT,
    initial_capital: 100_000,
    position_size: 100,
    commission: 0,
    slippage: 0.02,
    direction: "long",
  });
  const timeframe = TIMEFRAMES.find((item) => item.id === layout.timeframe) ?? TIMEFRAMES[7];
  const candles = useMemo(
    () => timeframe.aggregate ? aggregateIntraday(snapshot.history, timeframe.aggregate) : snapshot.history,
    [snapshot.history, timeframe.aggregate],
  );

  const hydrateWorkspace = useCallback(() => {
    const local = readLocalWorkspace().data;
    setLayouts(local.focus_layouts);
    setScripts(local.focus_scripts);
    const saved = local.focus_layouts.find((item) => item.ticker === ticker);
    if (saved) {
      setLayout(saved);
      dispatchDrawing({ type: "replace", items: saved.drawings });
    }
  }, [ticker]);
  useEffect(() => {
    const timer = window.setTimeout(() => setClientReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(hydrateWorkspace, 0);
    window.addEventListener(WORKSPACE_SYNC_EVENT, hydrateWorkspace);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(WORKSPACE_SYNC_EVENT, hydrateWorkspace);
    };
  }, [hydrateWorkspace]);

  useEffect(() => {
    if (!embedded) return;
    document.documentElement.dataset.focusEmbed = "true";
    const sendHeight = () => postNative({ type: "heightChanged", height: document.documentElement.scrollHeight });
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    const receive = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; value?: string; command?: string; timeframe?: string; chartType?: string; language?: "fr" | "en"; sessionToken?: string };
        if (message.type === "configure") {
          if (message.language) updatePreferences({ language: message.language });
          if (TIMEFRAMES.some((item) => item.id === message.timeframe)) setLayout((current) => ({ ...current, timeframe: message.timeframe as FocusTimeframe }));
          if (["candles", "bars", "line", "area", "heikin_ashi"].includes(message.chartType ?? "")) setLayout((current) => ({ ...current, chart_type: message.chartType as FocusChartType }));
          if (message.sessionToken) {
            void fetch("/api/account/mobile-session", { method: "POST", headers: { Authorization: `Bearer ${message.sessionToken}` }, credentials: "same-origin" })
              .then(async (response) => { if (!response.ok) throw new Error("Mobile session bootstrap failed"); await refreshAccount(); })
              .catch((reason: unknown) => postNative({ type: "error", message: reason instanceof Error ? reason.message : "Mobile session unavailable" }));
          }
        }
        if (message.type === "timeframe" && TIMEFRAMES.some((item) => item.id === message.value)) setLayout((current) => ({ ...current, timeframe: message.value as FocusTimeframe }));
        if (message.type === "chartType" && ["candles", "bars", "line", "area", "heikin_ashi"].includes(message.value ?? "")) setLayout((current) => ({ ...current, chart_type: message.value as FocusChartType }));
        if (message.type === "command") {
          const panelByCommand: Record<string, Exclude<Panel, null>> = { indicators: "indicators", compare: "compare", alert: "alerts", layouts: "layouts", strategy: "strategy", paper: "paper" };
          if (message.command && panelByCommand[message.command]) setPanel(panelByCommand[message.command]);
          if (message.command === "draw") setActiveTool("trendline");
          if (message.command === "fundamentals") setLayout((current) => ({ ...current, fundamentals_visible: !current.fundamentals_visible }));
          if (message.command === "undo") dispatchDrawing({ type: "undo" });
          if (message.command === "redo") dispatchDrawing({ type: "redo" });
        }
      } catch (reason) {
        postNative({ type: "error", message: reason instanceof Error ? reason.message : "Invalid native bridge message" });
      }
    };
    window.addEventListener("message", receive);
    postNative({ type: "ready", ticker });
    sendHeight();
    return () => {
      observer.disconnect();
      window.removeEventListener("message", receive);
      delete document.documentElement.dataset.focusEmbed;
    };
  }, [embedded, postNative, refreshAccount, ticker, updatePreferences]);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (stopped) return;
      setLiveState("connecting");
      socket = new WebSocket(quoteWebSocketUrl(ticker));
      socket.onopen = () => setLiveState("live");
      socket.onmessage = (event) => {
        try { setQuote(JSON.parse(event.data) as Quote); } catch { /* Ignore malformed ticks. */ }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (stopped) return;
        setLiveState("offline");
        retry = setTimeout(connect, 3_500);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [ticker]);

  useEffect(() => {
    if (section !== "chart") return;
    const controller = new AbortController();
    let active = true;
    const load = async (silent: boolean) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const next = await getFocusSnapshotForRange(
          ticker,
          timeframe.range,
          timeframe.providerInterval,
          controller.signal,
        );
        if (active) {
          setSnapshot(next);
          setQuote(next.quote);
          setError(null);
        }
      } catch (reason) {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Focus API unavailable");
      } finally {
        if (active) { setLoading(false); setRefreshing(false); }
      }
    };
    void load(false);
    const interval = timeframe.refreshMs ? window.setInterval(() => void load(true), timeframe.refreshMs) : null;
    return () => {
      active = false;
      controller.abort();
      if (interval) window.clearInterval(interval);
    };
  }, [initialSnapshot, layout.timeframe, section, ticker, timeframe.providerInterval, timeframe.range, timeframe.refreshMs]);

  useEffect(() => {
    const controller = new AbortController();
    if (section !== "chart") return () => controller.abort();
    if (!layout.comparisons.length) {
      const timer = window.setTimeout(() => setComparisons([]), 0);
      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }
    void Promise.all(layout.comparisons.map(async (item) => {
      const history = await getStockHistory(item.symbol, timeframe.range, timeframe.providerInterval, controller.signal);
      return {
        ...item,
        name: item.symbol,
        candles: timeframe.aggregate ? aggregateIntraday(history.candles, timeframe.aggregate) : history.candles,
      } satisfies ComparisonSeries;
    })).then(setComparisons).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Comparison unavailable");
    });
    return () => controller.abort();
  }, [layout.comparisons, section, timeframe.aggregate, timeframe.providerInterval, timeframe.range]);

  useEffect(() => {
    if (section !== "chart" || !layout.fundamentals_visible) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setFundamentalsLoading(true);
      void getFocusFundamentalOverlay(ticker, controller.signal)
        .then((value) => { if (active) setFundamentals(value); })
        .catch((reason: unknown) => {
          if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
            setError(reason instanceof Error ? reason.message : "Fundamentals unavailable");
          }
        })
        .finally(() => { if (active) setFundamentalsLoading(false); });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [layout.fundamentals_visible, section, ticker]);

  const saveLayout = useCallback((candidate = layout) => {
    const next = {
      ...candidate,
      drawings: drawingState.items,
      updated_at: new Date().toISOString(),
    };
    const workspace = readLocalWorkspace().data;
    const nextLayouts = [next, ...workspace.focus_layouts.filter((item) => item.id !== next.id)].slice(0, 10);
    writeLocalWorkspace({ ...workspace, focus_layouts: nextLayouts });
    setLayout(next);
    setLayouts(nextLayouts);
    postNative({ type: "layoutSaved" });
  }, [drawingState.items, layout, postNative]);

  const saveAlert = (rule: AlertRule) => {
    const workspace = readLocalWorkspace().data;
    writeLocalWorkspace({ ...workspace, alerts: [rule, ...workspace.alerts].slice(0, 50) });
    setPanel(null);
    postNative({ type: "alertCreated" });
  };
  const saveScript = () => {
    const source = backtestRequest.script ?? "";
    const item: FocusScript = {
      id: `script-${Date.now()}`,
      name: scriptValidation?.name ?? `Anatole Script ${scripts.length + 1}`,
      source,
      updated_at: new Date().toISOString(),
    };
    const workspace = readLocalWorkspace().data;
    const next = [item, ...workspace.focus_scripts].slice(0, 10);
    writeLocalWorkspace({ ...workspace, focus_scripts: next });
    setScripts(next);
  };
  const validateScript = async () => {
    setValidating(true);
    try { setScriptValidation(await validateAnatoleScript(backtestRequest.script ?? "")); }
    finally { setValidating(false); }
  };
  const runBacktest = async () => {
    setBacktestLoading(true);
    setBacktestError(null);
    try {
      setBacktest(await runFocusBacktest(backtestRequest));
    } catch (reason) {
      setBacktestError(reason instanceof Error ? reason.message : "Backtest unavailable");
    } finally {
      setBacktestLoading(false);
    }
  };
  const togglePanel = (next: Exclude<Panel, null>) => setPanel((current) => current === next ? null : next);
  const selectedDrawing = drawingState.items.find((item) => item.id === drawingState.selectedId) ?? null;
  const timeframeDrawings = drawingState.items.filter(
    (item) => !item.timeframe || item.timeframe === layout.timeframe,
  );
  const markers = layout.fundamentals_visible ? buildFundamentalMarkers(fundamentals) : [];
  const paperMarkers: FundamentalMarker[] = (paperAccount?.trades ?? [])
    .filter((trade) => trade.ticker === ticker)
    .map((trade) => ({
      id: `paper-${trade.id}`,
      time: Math.floor(Date.parse(trade.executed_at) / 1_000),
      kind: "corporate_event",
      title: trade.side === "buy" ? "B" : "S",
      detail: `${trade.side.toUpperCase()} ${trade.quantity} @ ${trade.price.toFixed(2)} CAD · PAPER`,
      source: "PAPER",
    }));

  return (
    <div className="focus-page" data-focus-embedded={embedded ? "true" : "false"} data-focus-ready={clientReady ? "true" : "false"}>
      {!embedded ? <QuoteHeader quote={quote} liveState={liveState} /> : null}
      {!embedded ? <nav className={styles.bottomTabs} aria-label="Focus sections">{SECTIONS.map((item) => <button key={item.id} className={`${styles.tabButton} ${section === item.id ? styles.buttonActive : ""}`} type="button" onClick={() => setSection(item.id)}>{pick(language, item.fr, item.en)}</button>)}<button className={styles.button} type="button" onClick={() => setSection("ecosystem")}><Network size={14} />{pick(language, "Voir le réseau", "View network")}</button></nav> : null}
      {section === "overview" ? <FocusRangeChart ticker={ticker} initialSnapshot={initialSnapshot} language={language} /> : section === "ecosystem" ? <CompanyEcosystem key={ticker} ticker={ticker} language={language} /> : section !== "chart" ? <FocusFundamentals ticker={ticker} view={section} /> : (
        <div className={styles.workspace}>
          <FocusToolbar ticker={ticker} timeframe={layout.timeframe} chartType={layout.chart_type} language={language} onTimeframe={(value) => setLayout({ ...layout, timeframe: value })} onChartType={(value) => setLayout({ ...layout, chart_type: value })} onToggleIndicators={() => togglePanel("indicators")} onToggleCompare={() => togglePanel("compare")} onCreateAlert={() => togglePanel("alerts")} onToggleLayouts={() => togglePanel("layouts")} onToggleStrategy={() => togglePanel("strategy")} onTogglePaper={() => togglePanel("paper")} onSaveLayout={() => saveLayout()} />
          <div className={`${styles.mainGrid} ${panel ? "" : styles.mainGridNoSide}`}>
            <FocusDrawingToolbar activeTool={activeTool} snapMode={snapMode} drawingsCount={timeframeDrawings.length} selected={selectedDrawing?.timeframe && selectedDrawing.timeframe !== layout.timeframe ? null : selectedDrawing} canUndo={drawingState.past.length > 0} canRedo={drawingState.future.length > 0} language={language} onTool={setActiveTool} onSnap={setSnapMode} onUndo={() => dispatchDrawing({ type: "undo" })} onRedo={() => dispatchDrawing({ type: "redo" })} onDuplicate={() => selectedDrawing && dispatchDrawing({ type: "duplicate", id: selectedDrawing.id })} onToggleLock={() => selectedDrawing && dispatchDrawing({ type: "update", id: selectedDrawing.id, update: { locked: !selectedDrawing.locked } })} onToggleHidden={() => selectedDrawing && dispatchDrawing({ type: "update", id: selectedDrawing.id, update: { hidden: !selectedDrawing.hidden } })} onDelete={() => selectedDrawing && dispatchDrawing({ type: "delete", id: selectedDrawing.id })} onFibLevels={(fib_levels) => selectedDrawing && dispatchDrawing({ type: "update", id: selectedDrawing.id, update: { fib_levels } })} onText={(text) => selectedDrawing && dispatchDrawing({ type: "update", id: selectedDrawing.id, update: { text } })} />
            <FocusChart candles={candles} quote={quote} technicals={snapshot.technicals} chartType={layout.chart_type} timeframe={layout.timeframe} indicators={layout.indicators} drawings={timeframeDrawings} comparisons={comparisons} fundamentalMarkers={[...markers, ...paperMarkers]} activeDrawingTool={activeTool} snapMode={snapMode} language={language} loading={loading} refreshing={refreshing} error={error} onAddDrawing={(drawing) => dispatchDrawing({ type: "add", drawing: { ...drawing, timeframe: layout.timeframe } })} onUpdateDrawing={(id, update) => dispatchDrawing({ type: "update", id, update })} onSelectDrawing={(id) => dispatchDrawing({ type: "select", id })} selectedDrawingId={drawingState.selectedId} onSelectMarker={setSelectedMarker} />
            {panel ? <aside className={styles.sidePanel}>
              {panel === "indicators" ? <FocusIndicatorPanel indicators={layout.indicators} language={language} onChange={(items) => setLayout({ ...layout, indicators: items })} onClose={() => setPanel(null)} /> : null}
              {panel === "compare" ? <FocusComparePanel ticker={ticker} comparisons={layout.comparisons} language={language} onChange={(items) => setLayout({ ...layout, comparisons: items })} onClose={() => setPanel(null)} /> : null}
              {panel === "alerts" ? <FocusAlertPanel ticker={ticker} price={quote.price} drawings={timeframeDrawings} language={language} onSave={saveAlert} onClose={() => setPanel(null)} /> : null}
              {panel === "layouts" ? <FocusLayoutsPanel language={language} layouts={layouts} currentId={layout.id} onLoad={(item) => { setLayout(item); dispatchDrawing({ type: "replace", items: item.drawings }); }} onCreate={() => { const item = { ...createDefaultFocusLayout(ticker), id: `layout-${crypto.randomUUID()}`, name: `Focus ${layouts.length + 1}` }; setLayout(item); dispatchDrawing({ type: "replace", items: [] }); }} onDelete={(id) => { const workspace = readLocalWorkspace().data; const next = workspace.focus_layouts.filter((item) => item.id !== id); writeLocalWorkspace({ ...workspace, focus_layouts: next }); setLayouts(next); }} onClose={() => setPanel(null)} /> : null}
              {panel === "strategy" ? <FocusStrategyPanel language={language} strategy={backtestRequest.strategy} parameters={backtestRequest.strategy_parameters} script={backtestRequest.script ?? ""} scripts={scripts} validation={scriptValidation} validating={validating} onStrategy={(strategy) => setBacktestRequest({ ...backtestRequest, strategy })} onParameters={(strategy_parameters) => setBacktestRequest({ ...backtestRequest, strategy_parameters })} onScript={(script) => { setBacktestRequest({ ...backtestRequest, script }); setScriptValidation(null); }} onValidate={validateScript} onSaveScript={saveScript} onLoadScript={(item) => setBacktestRequest({ ...backtestRequest, strategy: "anatole_script", script: item.source })} onRun={runBacktest} onClose={() => setPanel(null)} /> : null}
              {panel === "paper" ? <FocusPaperTrading ticker={ticker} language={language} authenticated={Boolean(user)} account={paperAccount} onAccount={onPaperAccount} /> : null}
            </aside> : null}
          </div>
          <div className={styles.sidePanel} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}><TechnicalSummary technicals={snapshot.technicals} /><KeyLevels technicals={snapshot.technicals} /><FocusFundamentalOverlay enabled={layout.fundamentals_visible} loading={fundamentalsLoading} markers={markers} selected={selectedMarker} language={language} onToggle={() => setLayout({ ...layout, fundamentals_visible: !layout.fundamentals_visible })} onSelect={setSelectedMarker} /></div>
          <div className={styles.inlineActions}><button className={styles.button} type="button" onClick={() => togglePanel("strategy")}><FlaskConical size={14} />Strategy Lab</button><button className={styles.button} type="button" onClick={() => togglePanel("paper")}><WalletCards size={14} />PAPER</button></div>
          <FocusBacktestPanel language={language} request={backtestRequest} result={backtest} loading={backtestLoading} error={backtestError} onChange={setBacktestRequest} onRun={runBacktest} />
          <FocusBottomPanel language={language} account={paperAccount} backtest={backtest} />
        </div>
      )}
    </div>
  );
}
