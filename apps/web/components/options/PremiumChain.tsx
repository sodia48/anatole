"use client";

import { useMemo, useState } from "react";
import { pairOptions } from "@anatole/shared/options-chain";
import type { OptionContract } from "@/lib/options-api";
import { pick } from "@/lib/i18n";


type Props = {
  contracts: OptionContract[];
  underlying: number | null;
  stale: boolean;
  language: "fr" | "en";
  display: (value: number | null | undefined, digits?: number) => string;
};

export function PremiumChain({ contracts, underlying, stale, language, display }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<OptionContract | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { moneyness = "all", freshness = "all", availability = "all" } = filters;
  const nearest = underlying != null && underlying > 0 && contracts.length
    ? Math.min(...contracts.map((item) => Math.abs(item.strike - underlying))) : null;

  const rows = useMemo(() => pairOptions(contracts.filter((item) => {
    const compare = (actual: number | null, target: string | undefined, minimum: boolean) =>
      !target || (actual != null && Number.isFinite(actual) &&
        (minimum ? actual >= Number(target) : actual <= Number(target)));
    const spread = item.bid != null && item.ask != null && item.ask >= item.bid ? item.ask - item.bid : null;
    if (availability === "quoted" && spread == null) return false;
    if (availability === "missing" && spread != null) return false;
    if (!compare(item.volume, filters.volume, true) || !compare(item.open_interest, filters.oi, true) ||
      !compare(spread, filters.spread, false) || !compare(item.delta, filters.deltaMin, true) ||
      !compare(item.delta, filters.deltaMax, false) || !compare(item.implied_volatility, filters.ivMin, true) ||
      !compare(item.implied_volatility, filters.ivMax, false)) return false;
    if (freshness === "fresh" && (stale || item.delayed)) return false;
    if (freshness === "delayed" && !stale && !item.delayed) return false;
    if (moneyness !== "all") {
      if (underlying == null || underlying <= 0) return false;
      const itm = item.side === "call" ? underlying > item.strike : underlying < item.strike;
      const otm = item.side === "call" ? underlying < item.strike : underlying > item.strike;
      if (moneyness === "itm" && !itm) return false;
      if (moneyness === "otm" && !otm) return false;
      if (moneyness === "atm" && Math.abs(item.strike - underlying) !== nearest) return false;
    }
    return true;
  })), [contracts, filters, moneyness, freshness, availability, stale, underlying, nearest]);

  const fields = [
    [pick(language, "Volume minimum", "Minimum volume"), "volume"],
    ["OI minimum", "oi"],
    [pick(language, "Spread maximum", "Maximum spread"), "spread"],
    ["Delta min", "deltaMin"], ["Delta max", "deltaMax"],
    ["IV min (%)", "ivMin"], ["IV max (%)", "ivMax"],
  ] as const;
  const selectFields = [
    ["Moneyness", "moneyness", [["atm", "ATM"], ["itm", "ITM"], ["otm", "OTM"]]],
    [pick(language, "Cotations", "Quotes"), "availability", [["quoted", "Bid / Ask"], ["missing", pick(language, "Incomplètes", "Incomplete")]]],
    [pick(language, "Fraîcheur", "Freshness"), "freshness", [["fresh", pick(language, "Non différé", "Not delayed")], ["delayed", pick(language, "Différé ou périmé", "Delayed or stale")]]],
  ] as const;
  const optionButton = (item: OptionContract | undefined) => item ? (
    <button type="button" className={`op-quote ${item.in_the_money ? "op-inMoney" : ""}`} onClick={() => setSelected(item)} aria-pressed={selected === item}
      aria-label={`${item.side.toUpperCase()} ${display(item.strike)} · ${item.expiration ?? "N/D"} · ${item.symbol}`}>
      <span>Bid {display(item.bid)} · Ask {display(item.ask)}</span>
      <span>{item.market === "commodities" ? pick(language, "Prix fourni*", "Provider price*") : "Last"} {display(item.last)} · Vol {display(item.volume, 0)} · OI {display(item.open_interest, 0)}</span>
      <span>IV {display(item.implied_volatility, 1)} % · Δ {display(item.delta, 3)}</span>
      {item.in_the_money != null ? <span>{underlying === item.strike ? "ATM" : item.in_the_money ? "ITM" : "OTM"}</span> : null}
      {advanced ? <span>Γ {display(item.gamma, 4)} · Θ {display(item.theta, 3)} · Vega {display(item.vega, 3)}</span> : null}
    </button>
  ) : <span aria-label={pick(language, "Contrat absent", "Contract unavailable")}>—</span>;
  const detail = selected && contracts.includes(selected) ? selected : null;

  return <div className={"op-chain"} role="region" aria-label={pick(language, "Chaîne d'options", "Option chain")}>
    <div className={"op-toolbar"}>
      <button type="button" onClick={() => setAdvanced(!advanced)} aria-pressed={advanced}>
        {advanced ? pick(language, "Vue compacte", "Compact view") : pick(language, "Vue avancée", "Advanced view")}
      </button>
      <details><summary>{pick(language, "Filtres de chaîne", "Chain filters")}</summary>
        <div className={"op-filters"}>
          {fields.map(([label, key]) => <label key={key}>{label}
            <input type="number" step="any" value={filters[key] ?? ""} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} />
          </label>)}
          {selectFields.map(([label, key, options]) => <label key={key}>{label}
            <select value={filters[key] ?? "all"} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}>
              <option value="all">{pick(language, "Toutes", "All")}</option>
              {options.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>)}
        </div>
      </details>
    </div>
    {rows.length ? <div className={"op-rows"}>
      <div className={"op-head"}><span>CALLS</span><span>STRIKE</span><span>PUTS</span></div>
      {rows.slice(0, 1200).map((row) => <article className={"op-row"} key={row.key}>
        <div className={"op-side"}><strong>CALL</strong>{optionButton(row.call)}</div>
        <div className={"op-strike"}><strong>{display(row.strike)}</strong>
          {nearest != null && Math.abs(row.strike - (underlying ?? 0)) === nearest ? <span>ATM</span> : null}
          <small>{row.expiry ?? "N/D"}{row.contract ? ` · ${row.contract}` : ""}</small>
        </div>
        <div className={"op-side"}><strong>PUT</strong>{optionButton(row.put)}</div>
      </article>)}
      {rows.length > 1200 ? <p>{pick(language, "Affichage limité à 1 200 lignes.", "Display limited to 1,200 rows.")}</p> : null}
    </div> : <p>{pick(language, "Aucun contrat ne correspond aux filtres.", "No contracts match the filters.")}</p>}
    {detail ? <section className={"op-detail"} aria-label={pick(language, "Détails du contrat", "Contract details")}>
      <button type="button" onClick={() => setSelected(null)}>{pick(language, "Fermer", "Close")}</button>
      <strong>{detail.symbol} · {detail.side.toUpperCase()} · {display(detail.strike)}</strong>
      <p>{pick(language, "Échéance", "Expiry")}: {detail.expiration ?? "N/D"} · {detail.source}
        {detail.delayed || stale ? ` · ${pick(language, "différé ou périmé", "delayed or stale")}` : ""}</p>
      <p>Bid {display(detail.bid)} · Ask {display(detail.ask)} · IV {display(detail.implied_volatility, 1)} % · Δ {display(detail.delta, 3)} · Γ {display(detail.gamma, 4)} · Θ {display(detail.theta, 3)} · Vega {display(detail.vega, 3)}</p>
    </section> : null}
  </div>;
}
