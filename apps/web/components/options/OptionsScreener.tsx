"use client";

import { useMemo, useState } from "react";
import type { OptionChainSnapshot, OptionContract } from "@/lib/options-api";
import "./options-screener.css";
import { useOptionsText } from "./OptionsCopyProvider";

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
  const t = useOptionsText(language);
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("both");
  const [expiry, setExpiry] = useState("");
  const [volume, setVolume] = useState("");
  const [interest, setInterest] = useState("");
  const [sort, setSort] = useState<Sort>("expiry");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<OptionContract | null>(null);
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
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageResults = results.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const maxVolume = results.reduce((best, item) => Math.max(best, metric(item.volume) ?? 0), 0);
  const maxInterest = results.reduce((best, item) => Math.max(best, metric(item.open_interest) ?? 0), 0);
  const format = (number: number | null) => number == null ? "N/D" : number.toLocaleString(language === "fr" ? "fr-CA" : "en-CA");
  const cell = (number: number | null, max: number) => {
    const valid = metric(number);
    return <td style={valid != null && max > 0 ? { backgroundColor: `rgb(30 120 220 / ${0.08 + 0.32 * valid / max})` } : undefined}>{format(valid)}</td>;
  };

  return <section className="panel op-screener" aria-label={t("screener_001")}>
    <h2>{t("screener_002")}</h2>
    <p>{t("screener_003")}</p>
    <p>{t("screener_004")}: {chain.generated_at}{chain.stale ? ` · ${t("screener_005")}` : ""}. {t("screener_006")}</p>
    <div className="op-screen-layout"><div className="op-screen-filters">
      <label>{t("screener_007")}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>{t("screener_008")}<select value={side} onChange={(event) => setSide(event.target.value)}><option value="both">Call + Put</option><option value="call">Call</option><option value="put">Put</option></select></label>
      <label>{t("screener_009")}<select aria-label={t("screener_010")} value={selectedExpiry} onChange={(event) => setExpiry(event.target.value)}><option value="">{t("screener_011")}</option>{expiries.map((date) => <option key={date} value={date}>{date}</option>)}</select></label>
      <label>{t("screener_012")}<input type="number" min="0" step="1" value={volume} onChange={(event) => setVolume(event.target.value)} /></label>
      <label>{t("screener_013")}<input type="number" min="0" step="1" value={interest} onChange={(event) => setInterest(event.target.value)} /></label>
      <label>{t("screener_014")}<select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="expiry">{t("screener_015")}</option><option value="volume">Volume</option><option value="interest">{t("screener_016")}</option></select></label>
    </div><div className="op-screen-main">
    {invalid ? <p role="alert">{t("screener_017")}</p> : <p aria-live="polite">{results.length} {results.length === 1 ? t("screener_018") : t("screener_019")}</p>}
    {added ? <p aria-live="polite">{added.message}</p> : null}
    {results.length ? <><p className="op-screen-scroll-hint">{t("screener_020")}</p><div className="op-screen-table" tabIndex={0} aria-label={t("screener_021")}>
      <table data-mobile-scroll><thead><tr><th>{t("screener_022")}</th><th>{t("screener_023")}</th><th>Strike</th><th>Volume</th><th>{t("screener_024")}</th><th>Source</th><th>{t("screener_025")}</th></tr></thead>
        <tbody>{pageResults.map((item, index) => <tr key={`${item.symbol}:${page}:${index}`}>
          <td><button type="button" className="op-screen-select" onClick={() => setSelected(item)}>{item.side.toUpperCase()} · {item.symbol}{item.contract ? ` · ${item.contract}` : ""}</button></td><td>{item.expiration ?? "N/D"}</td><td>{format(metric(item.strike))}</td>
          {cell(item.volume, maxVolume)}{cell(item.open_interest, maxInterest)}
          <td>{item.source || "N/D"}{item.delayed ? ` · ${t("screener_026")}` : ""}</td><td><button type="button" onClick={() => setAdded(onAddStrategy(item) ? { message: t("screener_027"), target: "strategy" } : { message: t("screener_028") })}>{t("screener_029")}</button>{" "}<button type="button" onClick={() => { onTrack(item); setAdded({ message: t("screener_030"), target: "positions" }); }}>{t("screener_031")}</button></td>
        </tr>)}</tbody></table>
    </div><div className="op-pagination"><button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{t("screener_032")}</button><span>{safePage + 1} / {pageCount}</span><button type="button" disabled={safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}>{t("screener_033")}</button></div></> : !invalid ? <p>{t("screener_034")}</p> : null}
    </div>{selected && results.includes(selected) ? <aside className="op-screen-detail" aria-label={t("screener_035")}>
      <button type="button" onClick={() => setSelected(null)}>{t("screener_036")}</button>
      <h3>{selected.symbol}</h3><p>{selected.side.toUpperCase()} · {selected.strike} · {selected.expiration ?? "N/D"}</p>
      <p>Bid {format(selected.bid)} · Ask {format(selected.ask)} · Vol {format(selected.volume)} · OI {format(selected.open_interest)}</p>
      <p>{selected.source}{selected.delayed || chain.stale ? ` · ${t("screener_037")}` : ""}</p>
      <button type="button" onClick={() => onAddStrategy(selected)}>{t("screener_038")}</button>
      <button type="button" onClick={() => onTrack(selected)}>{t("screener_039")}</button>
    </aside> : null}</div>
  </section>;
}
