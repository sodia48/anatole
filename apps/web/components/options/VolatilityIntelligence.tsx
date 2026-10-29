"use client";

import { useEffect, useMemo, useState } from "react";
import { volatilitySeries } from "@anatole/shared/options-chain";
import { pick } from "@/lib/i18n";
import type { OptionChainSnapshot, OptionContract } from "@/lib/options-api";
import "./volatility-intelligence.css";

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

export function VolatilityIntelligence({ chain, language }: { chain: OptionChainSnapshot; language: "fr" | "en" }) {
  const tr = (fr: string, en: string) => pick(language, fr, en);
  const groups = useMemo(() => volatilitySeries(chain.contracts, chain.underlying_price), [chain.contracts, chain.underlying_price]);
  const [selectedKey, setSelectedKey] = useState("");
  const selected = groups.find((group) => group.key === selectedKey) ?? groups[0];
  const [eventState, setEventState] = useState<EventState | null>(null);
  const eventKey = `${chain.market}:${chain.symbol}`;

  useEffect(() => {
    if (chain.market !== "tsx") return;
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
  }, [chain.market, chain.symbol, eventKey]);

  const currentEvents = eventState?.key === eventKey ? eventState : null;
  const selectedPoints = selected?.points ?? [];
  const displayPoints = selectedPoints.slice(0, 1200);
  const allGreekPoints = selected ? chain.contracts.filter((contract) =>
    JSON.stringify([contract.market, contract.underlying, contract.contract, contract.expiration]) === selected.key)
    : chain.contracts;
  const greekPoints = allGreekPoints.slice(0, 1200);

  return <section className="op-volatility panel" aria-label={tr("Intelligence de volatilité", "Volatility intelligence")}>
    <h2>{tr("Intelligence de volatilité", "Volatility intelligence")}</h2>
    <p>{tr("Données de la chaîne chargée uniquement ; IV et Greeks peuvent provenir du fournisseur ou d'un modèle Anatole. Leur origine détaillée par contrat n'est pas disponible.", "Loaded chain only; IV and Greeks may come from the provider or an Anatole model. Per-contract provenance is unavailable.")}</p>
    <p>{tr("Instantané récupéré", "Snapshot retrieved")}: {chain.generated_at}{chain.stale ? ` · ${tr("périmé", "stale")}` : ""}{chain.market === "commodities" ? ` · ${tr("fraîcheur de cotation à confirmer", "quote freshness unconfirmed")}` : ""}</p>
    {!groups.length ? <p>{tr("Aucune série de volatilité exploitable dans la chaîne chargée.", "No usable volatility series in the loaded chain.")}</p> : <>
      <label>{tr("Série et échéance", "Series and expiry")}
        <select value={selected?.key ?? ""} onChange={(event) => setSelectedKey(event.target.value)}>
          {groups.map((group) => <option key={group.key} value={group.key}>{group.points[0].underlying} · {group.expiry}{group.contract ? ` · ${group.contract}` : ""}</option>)}
        </select>
      </label>
      <h3>Smile</h3>
      <p>{tr("Volatilité implicite (%) par strike ; chaque point représente un contrat identifiable. Les lignes relient les points et ne sont pas des observations.", "Implied volatility (%) by strike; each point represents an identifiable contract. Lines connect points and are not observations.")}</p>
      <Smile points={displayPoints} language={language} />
      <h3>Skew 25Δ</h3>
      {selected?.skew ? <p>{value(selected.skew.difference)} {tr("points de pourcentage", "percentage points")} · PUT {selected.skew.put.strike} Δ {value(selected.skew.put.delta, 3)} − CALL {selected.skew.call.strike} Δ {value(selected.skew.call.delta, 3)}. {tr("Points les plus proches de ±0,25 dans une tolérance de 0,10 ; sans interpolation.", "Nearest points to ±0.25 within a 0.10 tolerance; no interpolation.")}</p>
        : <p>{tr("N/D : points ±0,25 delta absents, trop éloignés ou ambigus.", "N/A: ±0.25 delta points are missing, too distant or ambiguous.")}</p>}
      <h3>{tr("Structure par échéance", "Term structure")}</h3>
      <p>{tr("Contrats au strike le plus proche du sous-jacent, sans interpolation. La chaîne chargée peut ne couvrir qu'une échéance.", "Contracts at the strike closest to the underlying, without interpolation. The loaded chain may contain only one expiry.")}</p>
      <div className="op-vol-table"><table><thead><tr><th>{tr("Échéance", "Expiry")}</th><th>{tr("Contrat", "Contract")}</th><th>ATM</th><th>IV %</th></tr></thead><tbody>
        {groups.slice(0, 100).flatMap((group) => group.atm.length ? group.atm.map((point) => <tr key={`${group.key}:${point.symbol}`}><td>{group.expiry}</td><td>{group.contract ?? "—"}</td><td>{point.side.toUpperCase()} {point.strike}</td><td>{value(point.implied_volatility)}</td></tr>) : [<tr key={group.key}><td>{group.expiry}</td><td>{group.contract ?? "—"}</td><td colSpan={2}>N/D</td></tr>])}
      </tbody></table></div>
      {groups.length > 100 ? <p>{tr("Structure limitée aux 100 premières séries.", "Term structure limited to the first 100 series.")}</p> : null}
    </>}
    <h3>Greeks Dashboard</h3>
    {greekPoints.length ? <div className="op-vol-table"><table><thead><tr><th>{tr("Contrat", "Contract")}</th><th>IV %</th><th>Δ</th><th>Γ</th><th>Θ</th><th>Vega</th></tr></thead><tbody>
      {greekPoints.map((point, index) => <tr key={`${point.symbol}:${index}`}><td>{point.side.toUpperCase()} {point.strike} · {point.symbol}</td><td>{value(point.implied_volatility)}</td><td>{value(point.delta, 3)}</td><td>{value(point.gamma, 4)}</td><td>{value(point.theta, 3)}</td><td>{value(point.vega, 3)}</td></tr>)}
    </tbody></table></div> : <p>{tr("Aucun contrat chargé.", "No contracts loaded.")}</p>}
    {selectedPoints.length > displayPoints.length || allGreekPoints.length > greekPoints.length ? <p>{tr("Affichage limité à 1 200 contrats par vue.", "Display limited to 1,200 contracts per view.")}</p> : null}
    <h3>{tr("Événements", "Events")}</h3>
    {chain.market !== "tsx" ? <p>{tr("Calendrier d'événements propre à ce contrat non disponible.", "A contract-specific event calendar is unavailable.")}</p>
      : !currentEvents ? <p>{tr("Chargement du calendrier de résultats…", "Loading the earnings calendar…")}</p>
      : currentEvents.status === "unavailable" || currentEvents.status === "loading" ? <p>{tr("Calendrier de résultats temporairement indisponible.", "Earnings calendar temporarily unavailable.")}</p>
      : currentEvents.events.length ? <ul>{currentEvents.events.map((event, index) => <li key={`${event.symbol}:${event.window_start}:${index}`}>
        {event.company} · {event.window_start} — {event.window_end} · {event.source}
        {eventTiming(event, selected?.expiry, language) ? ` · ${eventTiming(event, selected?.expiry, language)}` : ""}
        {event.time_is_estimated ? ` · ${tr("horaire estimé", "estimated time")}` : ""}
        {currentEvents.stale ? ` · ${tr("calendrier périmé", "stale calendar")}` : ""}
        {currentEvents.status === "partial" ? ` · ${tr("couverture partielle", "partial coverage")}` : ""}
        {event.url?.startsWith("https://") ? <> · <a href={event.url} target="_blank" rel="noopener noreferrer">{tr("Source", "Source")}</a></> : null}
      </li>)}</ul> : <p>{tr("Aucun résultat identifié dans le calendrier chargé ; cela ne prouve pas l'absence d'événement.", "No earnings event identified in the loaded calendar; this does not prove that no event exists.")}{currentEvents.status === "partial" ? ` · ${tr("couverture partielle", "partial coverage")}` : ""}{currentEvents.stale ? ` · ${tr("calendrier périmé", "stale calendar")}` : ""}</p>}
    <p>{tr("L'heure et le fuseau de l'échéance ne sont pas fournis. Aucun impact d'événement ou mouvement futur n'est estimé. Données descriptives, sans recommandation.", "The expiry time and time zone are unavailable. No event impact or future move is estimated. Descriptive data, not a recommendation.")}</p>
  </section>;
}

function Smile({ points, language }: { points: OptionContract[]; language: "fr" | "en" }) {
  const tr = (fr: string, en: string) => pick(language, fr, en);
  const xs = points.map((point) => point.strike);
  const ys = points.map((point) => point.implied_volatility!);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paths = (["call", "put"] as const).map((side) => points.filter((point) => point.side === side)
    .map((point, index) => `${index ? "L" : "M"} ${20 + (point.strike - minX) / (maxX - minX || 1) * 560} ${180 - (point.implied_volatility! - minY) / (maxY - minY || 1) * 160}`).join(" "));
  return <>
    <svg viewBox="0 0 600 200" role="img" aria-label={tr("Smile : volatilité implicite par strike", "Smile: implied volatility by strike")}>
      <path d={paths[0]} fill="none" stroke="var(--accent-text)" strokeWidth="3" />
      <path d={paths[1]} fill="none" stroke="var(--teal)" strokeWidth="3" strokeDasharray="6 3" />
      {points.map((point, index) => <circle key={`${point.symbol}:${index}`} cx={20 + (point.strike - minX) / (maxX - minX || 1) * 560} cy={180 - (point.implied_volatility! - minY) / (maxY - minY || 1) * 160} r="3" fill={point.side === "call" ? "var(--accent-text)" : "var(--teal)"} />)}
    </svg>
    <p>CALL — · PUT - - · {tr("Strike", "Strike")} {value(minX)}–{value(maxX)} · IV {value(minY)}–{value(maxY)} %</p>
  </>;
}
