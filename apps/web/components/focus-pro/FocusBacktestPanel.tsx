"use client";

import { FocusGlyph } from "./FocusGlyph";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { BacktestRequest, BacktestResult } from "@/lib/types";

import "./FocusPro.css";

const money = (value: number) => new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
}).format(value);

export function FocusBacktestPanel({
  language,
  request,
  result,
  loading,
  error,
  onChange,
  onRun,
}: {
  language: AnatoleLanguage;
  request: BacktestRequest;
  result: BacktestResult | null;
  loading: boolean;
  error: string | null;
  onChange: (request: BacktestRequest) => void;
  onRun: () => void;
}) {
  const number = (key: "initial_capital" | "position_size" | "commission" | "slippage") => (value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) onChange({ ...request, [key]: parsed });
  };
  const points = result?.equity_curve ?? [];
  const min = Math.min(...points.map((item) => item.equity), request.initial_capital);
  const max = Math.max(...points.map((item) => item.equity), request.initial_capital);
  const path = points.map((item, index) => {
    const x = points.length <= 1 ? 0 : index / (points.length - 1) * 100;
    const y = 42 - ((item.equity - min) / Math.max(max - min, 1)) * 40;
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const largestDrawdown = Math.max(
    ...points.map((item) => Math.abs(item.drawdown_percent)),
    1,
  );
  const drawdownPath = points.map((item, index) => {
    const x = points.length <= 1 ? 0 : index / (points.length - 1) * 100;
    const y = 2 + Math.abs(item.drawdown_percent) / largestDrawdown * 40;
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return (
    <section className="fp-panel" aria-label="Backtest">
      <header className="fp-sectionHeader">
        <div><span className="fp-eyebrow">BACKTEST</span><h2>{pick(language, "Simulation sans lookahead", "No-lookahead simulation")}</h2></div>
        <button className="fp-primaryButton" type="button" onClick={onRun} disabled={loading}><FocusGlyph name="Play" size={14} />{loading ? "…" : pick(language, "Exécuter", "Run")}</button>
      </header>
      <div className="fp-sectionBody">
        <div className="fp-inlineActions">
          <label className="fp-field">Ticker<input className="fp-input" value={request.ticker} onChange={(event) => onChange({ ...request, ticker: event.target.value.toUpperCase() })} /></label>
          <label className="fp-field">{pick(language, "Stratégie", "Strategy")}<select className="fp-select" value={request.strategy} onChange={(event) => onChange({ ...request, strategy: event.target.value as BacktestRequest["strategy"] })}><option value="sma_crossover">SMA crossover</option><option value="ema_crossover">EMA crossover</option><option value="rsi_mean_reversion">RSI mean reversion</option><option value="macd_crossover">MACD crossover</option><option value="bollinger_breakout">Bollinger breakout</option><option value="donchian_breakout">Donchian breakout</option><option value="anatole_script">Anatole Script</option></select></label>
          <label className="fp-field">{pick(language, "Période", "Range")}<select className="fp-select" value={request.range} onChange={(event) => onChange({ ...request, range: event.target.value })}><option value="3mo">3M</option><option value="6mo">6M</option><option value="1y">1Y</option><option value="2y">2Y</option><option value="5y">5Y</option><option value="10y">10Y</option></select></label>
          <label className="fp-field">{pick(language, "Unité", "Timeframe")}<select className="fp-select" value={request.interval} onChange={(event) => onChange({ ...request, interval: event.target.value })}><option value="5m">5m</option><option value="15m">15m</option><option value="30m">30m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1D</option><option value="1wk">1W</option><option value="1mo">1M</option></select></label>
          <label className="fp-field">{pick(language, "Capital", "Capital")}<input className="fp-input" type="number" min="100" value={request.initial_capital} onChange={(event) => number("initial_capital")(event.target.value)} /></label>
          <label className="fp-field">{pick(language, "Position %", "Position %")}<input className="fp-input" type="number" min="1" max="100" value={request.position_size} onChange={(event) => number("position_size")(event.target.value)} /></label>
          <label className="fp-field">{pick(language, "Commission", "Commission")}<input className="fp-input" type="number" min="0" value={request.commission} onChange={(event) => number("commission")(event.target.value)} /></label>
          <label className="fp-field">Slippage %<input className="fp-input" type="number" min="0" step="0.01" value={request.slippage} onChange={(event) => number("slippage")(event.target.value)} /></label>
          <label className="fp-field">{pick(language, "Direction", "Direction")}<select className="fp-select" value={request.direction} onChange={(event) => onChange({ ...request, direction: event.target.value as BacktestRequest["direction"] })}><option value="long">Long</option><option value="short">Short</option><option value="both">Long + Short</option></select></label>
        </div>
        {error ? <div className="fp-errorNotice">{error}</div> : null}
        {result ? (
          <>
            <div className="fp-kpiGrid">
              <div className="fp-kpi"><span>{pick(language, "Résultat net", "Net profit")}</span><strong className={result.net_profit >= 0 ? "fp-positive" : "fp-negative"}>{money(result.net_profit)} · {result.net_profit_percent.toFixed(2)}%</strong></div>
              <div className="fp-kpi"><span>CAGR</span><strong>{result.cagr?.toFixed(2) ?? "N/D"}%</strong></div>
              <div className="fp-kpi"><span>Max drawdown</span><strong className="fp-negative">{result.max_drawdown_percent.toFixed(2)}%</strong></div>
              <div className="fp-kpi"><span>Win rate</span><strong>{result.win_rate.toFixed(1)}%</strong></div>
              <div className="fp-kpi"><span>Trades</span><strong>{result.trades_count}</strong></div>
              <div className="fp-kpi"><span>Profit factor</span><strong>{result.profit_factor?.toFixed(2) ?? "N/D"}</strong></div>
              <div className="fp-kpi"><span>Sharpe</span><strong>{result.sharpe?.toFixed(2) ?? "N/D"}</strong></div>
              <div className="fp-kpi"><span>Sortino</span><strong>{result.sortino?.toFixed(2) ?? "N/D"}</strong></div>
              <div className="fp-kpi"><span>Exposure</span><strong>{result.exposure_percent.toFixed(1)}%</strong></div>
            </div>
            {path ? <div><span className="fp-eyebrow">EQUITY CURVE</span><svg viewBox="0 0 100 44" role="img" aria-label="Equity curve" style={{ width: "100%", height: 100 }}><path d={path} fill="none" stroke="#2c9cff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></svg></div> : null}
            {drawdownPath ? <div><span className="fp-eyebrow">DRAWDOWN</span><svg viewBox="0 0 100 44" role="img" aria-label="Drawdown chart" style={{ width: "100%", height: 80 }}><path d={drawdownPath} fill="none" stroke="#ff5f76" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></svg></div> : null}
            <p className="fp-notice">{result.execution_convention}<br />{result.disclaimer}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
