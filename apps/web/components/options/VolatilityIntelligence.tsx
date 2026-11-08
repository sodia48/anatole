"use client";

import { useEffect, useMemo, useState } from "react";
import { volatilitySeries } from "@anatole/shared/options-chain";
import type { OptionChainSnapshot, OptionContract } from "@/lib/options-api";
import "./volatility-intelligence.css";
import { useOptionsText } from "./OptionsCopyProvider";

type Event = { ticker: string; symbol: string; company: string; window_start: string; window_end: string; time_is_estimated: boolean; source: string; url: string };
type EventState = { key: string; status: string; stale: boolean; events: Event[] };

function value(number: number | null | undefined, digits = 2): string {
  return number != null && Number.isFinite(number) ? number.toFixed(digits) : "N/D";
}

function eventTiming(event: Event, expiry: string | undefined, language: "fr" | "en"): string {
  if (!expiry) return "";
  const start = Date.parse(event.window_start);
  const end = Date.parse(event.window_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const firstDay = new Date(start).toISOString().slice(0, 10);
  const lastDay = new Date(end).toISOString().slice(0, 10);
  if (lastDay < expiry) return language === "fr" ? "fenêtre UTC avant la date d'échéance affichée" : "UTC window before the displayed expiry date";
  if (firstDay > expiry) return language === "fr" ? "fenêtre UTC après la date d'échéance affichée" : "UTC window after the displayed expiry date";
  return language === "fr" ? "date de l'événement proche de l'échéance, horaire à vérifier" : "event date near expiry, timing to be confirmed";
}

type VolatilityView = "overview" | "smile" | "term" | "greeks" | "events";

export function VolatilityIntelligence({ chain, language, active }: { chain: OptionChainSnapshot; language: "fr" | "en"; active: boolean }) {
  const t = useOptionsText(language);
  const groups = useMemo(() => volatilitySeries(chain.contracts, chain.underlying_price), [chain.contracts, chain.underlying_price]);
  const [selectedKey, setSelectedKey] = useState("");
  const [view, setView] = useState<VolatilityView>("overview");
  const selected = groups.find((group) => group.key === selectedKey) ?? groups[0];
  const [eventState, setEventState] = useState<EventState | null>(null);
  const eventKey = `${chain.market}:${chain.symbol}`;

  useEffect(() => {
    if (!active || view !== "events" || chain.market !== "tsx") return;
    const controller = new AbortController();
    void fetch("/api/anatole/api/v1/discovery/earnings-calendar?universe=composite", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return await response.json() as { events?: Event[]; stale?: boolean; status?: string };
      })
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        const ticker = chain.symbol.toUpperCase();
        const events = (snapshot.events ?? []).filter((event) =>
          event.ticker?.toUpperCase() === ticker || event.symbol?.toUpperCase() === ticker ||
          event.symbol?.toUpperCase() === `${ticker}.TO`);
        setEventState({ key: eventKey, events, stale: Boolean(snapshot.stale), status: snapshot.status ?? "available" });
      })
      .catch(() => { if (!controller.signal.aborted) setEventState({ key: eventKey, events: [], stale: false, status: "unavailable" }); });
    return () => controller.abort();
  }, [active, view, chain.market, chain.symbol, eventKey]);

  const currentEvents = eventState?.key === eventKey ? eventState : null;
  const selectedPoints = selected?.points ?? [];
  const displayPoints = selectedPoints.slice(0, 120);
  const allGreekPoints = selected ? chain.contracts.filter((contract) =>
    JSON.stringify([contract.market, contract.underlying, contract.contract, contract.expiration]) === selected.key)
    : chain.contracts;
  const greekPoints = allGreekPoints.slice(0, 80);

  return <section className="op-volatility panel" aria-label={t("volatility_001")}>
    <div className="op-vol-head"><div><span className="eyebrow">VOLATILITY INTELLIGENCE</span><h2>Volatility Intelligence — {chain.symbol}</h2></div>
      <small>{t("volatility_002")} · {chain.generated_at}{chain.stale ? ` · ${t("volatility_003")}` : ""}</small></div>
    <nav className="op-vol-nav" aria-label={t("volatility_004")}>
      {([ ["overview", t("volatility_005")], ["smile", "Smile et skew"], ["term", t("volatility_006")],
        ["greeks", "Greeks"], ["events", t("volatility_007")] ] as const).map(([key, label]) => <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => setView(key)}>{label}</button>)}
    </nav>
    {!groups.length ? <p>{t("volatility_008")}</p> : <>
      <label>{t("volatility_009")}
        <select value={selected?.key ?? ""} onChange={(event) => setSelectedKey(event.target.value)}>
          {groups.map((group) => <option key={group.key} value={group.key}>{group.points[0].underlying} · {group.expiry}{group.contract ? ` · ${group.contract}` : ""}</option>)}
        </select>
      </label>
      {(view === "overview" || view === "smile") ? <div className="op-vol-feature"><h3>Smile</h3>
      <Smile points={displayPoints} language={language} />
      <h3>Skew 25Δ</h3>
      {selected?.skew ? <p>{value(selected.skew.difference)} {t("volatility_010")} · PUT {selected.skew.put.strike} Δ {value(selected.skew.put.delta, 3)} − CALL {selected.skew.call.strike} Δ {value(selected.skew.call.delta, 3)}.</p>
        : <p>{t("volatility_011")}</p>}
      <details><summary>{t("volatility_012")}</summary><p>{t("volatility_013")}</p></details>
      </div> : null}
      {view === "term" ? <div className="op-vol-feature">
      <h3>{t("volatility_014")}</h3>
      <p>{t("volatility_015")}</p>
      <div className="op-vol-table"><table><thead><tr><th>{t("volatility_016")}</th><th>{t("volatility_017")}</th><th>ATM</th><th>IV %</th></tr></thead><tbody>
        {groups.slice(0, 100).flatMap((group) => group.atm.length ? group.atm.map((point) => <tr key={`${group.key}:${point.symbol}`}><td>{group.expiry}</td><td>{group.contract ?? "—"}</td><td>{point.side.toUpperCase()} {point.strike}</td><td>{value(point.implied_volatility)}</td></tr>) : [<tr key={group.key}><td>{group.expiry}</td><td>{group.contract ?? "—"}</td><td colSpan={2}>N/D</td></tr>])}
      </tbody></table></div>
      {groups.length > 100 ? <p>{t("volatility_018")}</p> : null}</div> : null}
    </>}
    {view === "greeks" ? <div className="op-vol-feature"><h3>Greeks Dashboard</h3>
    {greekPoints.length ? <div className="op-vol-table"><table><thead><tr><th>{t("volatility_019")}</th><th>IV %</th><th>Δ</th><th>Γ</th><th>Θ</th><th>Vega</th></tr></thead><tbody>
      {greekPoints.map((point, index) => <tr key={`${point.symbol}:${index}`}><td>{point.side.toUpperCase()} {point.strike} · {point.symbol}</td><td>{value(point.implied_volatility)}</td><td>{value(point.delta, 3)}</td><td>{value(point.gamma, 4)}</td><td>{value(point.theta, 3)}</td><td>{value(point.vega, 3)}</td></tr>)}
    </tbody></table></div> : <p>{t("volatility_020")}</p>}
    {allGreekPoints.length > greekPoints.length ? <p>{t("volatility_021")}</p> : null}</div> : null}
    {view === "events" ? <div className="op-vol-feature"><h3>{t("volatility_022")}</h3>
    {chain.market !== "tsx" ? <p>{t("volatility_023")}</p>
      : !currentEvents ? <p>{t("volatility_024")}</p>
      : currentEvents.status === "unavailable" || currentEvents.status === "loading" ? <p>{t("volatility_025")}</p>
      : currentEvents.events.length ? <ul>{currentEvents.events.map((event, index) => <li key={`${event.symbol}:${event.window_start}:${index}`}>
        {event.company} · {event.window_start} — {event.window_end} · {event.source}
        {eventTiming(event, selected?.expiry, language) ? ` · ${eventTiming(event, selected?.expiry, language)}` : ""}
        {event.time_is_estimated ? ` · ${t("volatility_026")}` : ""}
        {currentEvents.stale ? ` · ${t("volatility_027")}` : ""}
        {currentEvents.status === "partial" ? ` · ${t("volatility_028")}` : ""}
        {event.url?.startsWith("https://") ? <> · <a href={event.url} target="_blank" rel="noopener noreferrer">{t("volatility_029")}</a></> : null}
      </li>)}</ul> : <p>{t("volatility_030")}{currentEvents.status === "partial" ? ` · ${t("volatility_031")}` : ""}{currentEvents.stale ? ` · ${t("volatility_032")}` : ""}</p>}
    <p>{t("volatility_033")}</p></div> : null}
    {selectedPoints.length > displayPoints.length ? <p>{t("volatility_034")}</p> : null}
  </section>;
}

function Smile({ points, language }: { points: OptionContract[]; language: "fr" | "en" }) {
  const t = useOptionsText(language);
  const xs = points.map((point) => point.strike);
  const ys = points.map((point) => point.implied_volatility!);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paths = (["call", "put"] as const).map((side) => points.filter((point) => point.side === side)
    .map((point, index) => `${index ? "L" : "M"} ${20 + (point.strike - minX) / (maxX - minX || 1) * 560} ${180 - (point.implied_volatility! - minY) / (maxY - minY || 1) * 160}`).join(" "));
  return <>
    <svg viewBox="0 0 600 200" role="img" aria-label={t("volatility_035")}>
      <path d={paths[0]} fill="none" stroke="var(--accent-text)" strokeWidth="3" />
      <path d={paths[1]} fill="none" stroke="var(--teal)" strokeWidth="3" strokeDasharray="6 3" />
      {points.map((point, index) => <circle key={`${point.symbol}:${index}`} cx={20 + (point.strike - minX) / (maxX - minX || 1) * 560} cy={180 - (point.implied_volatility! - minY) / (maxY - minY || 1) * 160} r="4" tabIndex={0} aria-label={`${point.symbol} · ${point.expiration} · ${t("volatility_036")} ${point.strike} · IV ${value(point.implied_volatility)} %`} fill={point.side === "call" ? "var(--accent-text)" : "var(--teal)"}><title>{point.symbol} · {point.expiration} · strike {point.strike} · IV {value(point.implied_volatility)} %</title></circle>)}
    </svg>
    <p>CALL — · PUT - - · {t("volatility_037")} {value(minX)}–{value(maxX)} · IV {value(minY)}–{value(maxY)} %</p>
  </>;
}
