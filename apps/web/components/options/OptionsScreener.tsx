"use client";

import { useMemo, useState } from "react";
import type { OptionChainSnapshot, OptionContract } from "@/lib/options-api";
import "./options-screener.css";

type Props = { chain: OptionChainSnapshot; language: "fr" | "en"; onAddStrategy: (contract: OptionContract) => boolean; onTrack: (contract: OptionContract) => void };
type Sort = "expiry" | "volume" | "interest";

function metric(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

function threshold(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : NaN;
}

export function OptionsScreener({ chain, language, onAddStrategy, onTrack }: Props) {
  const tr = (fr: string, en: string) => language === "fr" ? fr : en;
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("both");
  const [expiry, setExpiry] = useState("");
  const [volume, setVolume] = useState("");
  const [interest, setInterest] = useState("");
  const [sort, setSort] = useState<Sort>("expiry");
  const [added, setAdded] = useState<{ message: string; target?: "strategy" | "positions" } | null>(null);
  const minVolume = threshold(volume);
  const minInterest = threshold(interest);
  const invalid = Number.isNaN(minVolume) || Number.isNaN(minInterest);
  const expiries = useMemo(() => [...new Set(chain.contracts.map((item) => item.expiration).filter((value): value is string => Boolean(value)))].sort(), [chain.contracts]);
  const selectedExpiry = expiries.includes(expiry) ? expiry : "";
  const results = useMemo(() => {
    if (invalid) return [];
    const search = query.trim().toLocaleLowerCase();
    return chain.contracts.filter((item) => {
      const vol = metric(item.volume);
      const oi = metric(item.open_interest);
      return (!search || `${item.symbol} ${item.contract ?? ""} ${item.strike}`.toLocaleLowerCase().includes(search)) &&
        (side === "both" || item.side === side) && (!selectedExpiry || item.expiration === selectedExpiry) &&
        (minVolume == null || (vol != null && vol >= minVolume)) &&
        (minInterest == null || (oi != null && oi >= minInterest));
    }).sort((a, b) => {
      if (sort !== "expiry") {
        const aMetric = metric(sort === "volume" ? a.volume : a.open_interest);
        const bMetric = metric(sort === "volume" ? b.volume : b.open_interest);
        if (aMetric == null && bMetric != null) return 1;
        if (aMetric != null && bMetric == null) return -1;
        if (aMetric != null && bMetric != null && aMetric !== bMetric) return bMetric - aMetric;
      }
      return (a.expiration ?? "9999").localeCompare(b.expiration ?? "9999") ||
        a.strike - b.strike || a.symbol.localeCompare(b.symbol);
    });
  }, [chain.contracts, query, side, selectedExpiry, minVolume, minInterest, invalid, sort]);
  const maxVolume = results.reduce((best, item) => Math.max(best, metric(item.volume) ?? 0), 0);
  const maxInterest = results.reduce((best, item) => Math.max(best, metric(item.open_interest) ?? 0), 0);
  const format = (number: number | null) => number == null ? "N/D" : number.toLocaleString(language === "fr" ? "fr-CA" : "en-CA");
  const cell = (number: number | null, max: number) => {
    const valid = metric(number);
    return <td style={valid != null && max > 0 ? { backgroundColor: `rgb(30 120 220 / ${0.08 + 0.32 * valid / max})` } : undefined}>{format(valid)}</td>;
  };

  return <section className="panel op-screener" aria-label={tr("Screener de contrats", "Contract screener")}>
    <h2>{tr("Screener et heatmap des contrats", "Contract screener and heatmap")}</h2>
    <p>{tr("Recherche limitée à la chaîne chargée, pas à tout le marché. Les couleurs comparent les valeurs disponibles dans les résultats filtrés ; N/D reste distinct de zéro.", "Search is limited to the loaded chain, not the entire market. Colors compare available values in the filtered results; N/A is distinct from zero.")}</p>
    <p>{tr("Instantané récupéré", "Snapshot retrieved")}: {chain.generated_at}{chain.stale ? ` · ${tr("périmé", "stale")}` : ""}. {tr("L'heure de récupération ne garantit pas la fraîcheur de chaque cotation.", "Retrieval time does not guarantee freshness of individual quotes.")}</p>
    <div className="op-screen-filters">
      <label>{tr("Contrat ou strike", "Contract or strike")}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>{tr("Type", "Type")}<select value={side} onChange={(event) => setSide(event.target.value)}><option value="both">Call + Put</option><option value="call">Call</option><option value="put">Put</option></select></label>
      <label>{tr("Échéance", "Expiry")}<select aria-label={tr("Échéance", "Expiry")} value={selectedExpiry} onChange={(event) => setExpiry(event.target.value)}><option value="">{tr("Toutes", "All")}</option>{expiries.map((date) => <option key={date} value={date}>{date}</option>)}</select></label>
      <label>{tr("Volume minimum", "Minimum volume")}<input type="number" min="0" step="1" value={volume} onChange={(event) => setVolume(event.target.value)} /></label>
      <label>{tr("Intérêt ouvert minimum", "Minimum open interest")}<input type="number" min="0" step="1" value={interest} onChange={(event) => setInterest(event.target.value)} /></label>
      <label>{tr("Trier par", "Sort by")}<select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="expiry">{tr("Échéance et strike", "Expiry and strike")}</option><option value="volume">Volume</option><option value="interest">{tr("Intérêt ouvert", "Open interest")}</option></select></label>
    </div>
    {invalid ? <p role="alert">{tr("Les minimums doivent être des entiers positifs ou nuls.", "Minimums must be non-negative integers.")}</p> : <p aria-live="polite">{results.length} {results.length === 1 ? tr("contrat correspondant", "matching contract") : tr("contrats correspondants", "matching contracts")}{results.length > 100 ? ` · ${tr("100 affichés", "100 shown")}` : ""}</p>}
    {added ? <p aria-live="polite">{added.message}{added.target ? <> · <a href={added.target === "strategy" ? "#options-strategy-builder" : "#options-positions"}>{added.target === "strategy" ? tr("Voir la stratégie", "View strategy") : tr("Voir les positions", "View positions")}</a></> : null}</p> : null}
    {results.length ? <><p className="op-screen-scroll-hint">{tr("Faites défiler le tableau horizontalement pour voir toutes les colonnes.", "Scroll the table horizontally to see all columns.")}</p><div className="op-screen-table" tabIndex={0} aria-label={tr("Résultats et heatmap", "Results and heatmap")}>
      <table data-mobile-scroll><thead><tr><th>{tr("Contrat", "Contract")}</th><th>{tr("Échéance", "Expiry")}</th><th>Strike</th><th>Volume</th><th>{tr("Intérêt ouvert", "Open interest")}</th><th>Source</th><th>{tr("Actions", "Actions")}</th></tr></thead>
        <tbody>{results.slice(0, 100).map((item, index) => <tr key={`${item.symbol}:${index}`}>
          <td>{item.side.toUpperCase()} · {item.symbol}{item.contract ? ` · ${item.contract}` : ""}</td><td>{item.expiration ?? "N/D"}</td><td>{format(metric(item.strike))}</td>
          {cell(item.volume, maxVolume)}{cell(item.open_interest, maxInterest)}
          <td>{item.source || "N/D"}{item.delayed ? ` · ${tr("différé", "delayed")}` : ""}</td><td><button type="button" onClick={() => setAdded(onAddStrategy(item) ? { message: tr("Contrat ajouté", "Contract added"), target: "strategy" } : { message: tr("Limite de 20 jambes atteinte", "20-leg limit reached") })}>{tr("Ajouter", "Add")}</button>{" "}<button type="button" onClick={() => { onTrack(item); setAdded({ message: tr("Contrat sélectionné pour le suivi", "Contract selected for tracking"), target: "positions" }); }}>{tr("Suivre", "Track")}</button></td>
        </tr>)}</tbody></table>
    </div></> : !invalid ? <p>{tr("Aucun contrat ne correspond aux filtres.", "No contracts match the filters.")}</p> : null}
  </section>;
}
