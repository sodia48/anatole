"use client";

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { OptionContract } from "@/lib/options-api";
import "./strategy-builder.css";
import { useOptionsText } from "./OptionsCopyProvider";

export type StrategyLeg = {
  id: number;
  contract: OptionContract;
  direction: "long" | "short";
  quantity: string;
  premium: string;
  multiplier: string;
  snapshotStale: boolean;
  snapshotAt: string;
  upfront: boolean;
  verifiedCurrency?: string;
  verifiedExpiry?: string;
};

type Result = {
  currency: string;
  points: { price: string; profit_loss: string }[];
  theoretical_debit: string | null;
  minimum_profit_loss: string | null;
  maximum_profit_loss: string | null;
  loss_unbounded: boolean;
  gain_unbounded: boolean;
  break_evens: { lower: string | null; upper: string | null }[];
};

type Scenario = { id: number; result: Result; description: string };

export function StrategyBuilder({ legs, setLegs, language, onChooseContracts }: {
  legs: StrategyLeg[];
  setLegs: Dispatch<SetStateAction<StrategyLeg[]>>;
  language: "fr" | "en";
  onChooseContracts: () => void;
}) {
  const t = useOptionsText(language);
  const [currency, setCurrency] = useState("");
  const [expiry, setExpiry] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function updateLeg(id: number, patch: Partial<StrategyLeg>) {
    setLegs((current) => current.map((leg) => leg.id === id ? { ...leg, ...patch } : leg));
  }

  function applyTemplate(template: string) {
    if (template === "custom") return;
    const sorted = [...legs].sort((a, b) => a.contract.strike - b.contract.strike);
    const first = sorted[0];
    const second = sorted[1];
    const sameSeries = second && first.contract.underlying === second.contract.underlying &&
      first.contract.market === second.contract.market && first.contract.contract === second.contract.contract &&
      first.contract.expiration != null && first.contract.expiration === second.contract.expiration;
    let directions: ("long" | "short")[] | null = null;
    if (template === "long-call" && sorted.length === 1 && first.contract.side === "call") directions = ["long"];
    if (template === "long-put" && sorted.length === 1 && first.contract.side === "put") directions = ["long"];
    if (template === "bull-call" && sorted.length === 2 && sameSeries &&
      first.contract.side === "call" && second.contract.side === "call" && first.contract.strike < second.contract.strike) directions = ["long", "short"];
    if (template === "straddle" && sorted.length === 2 && sameSeries &&
      first.contract.side !== second.contract.side && first.contract.strike === second.contract.strike) directions = ["long", "long"];
    if (!directions) {
      setError(t("strategy_001"));
      return;
    }
    setError("");
    setLegs(sorted.map((leg, index) => ({ ...leg, direction: directions![index], quantity: "1" })));
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const low = Number(minimum);
    const high = Number(maximum);
    const first = legs[0]?.contract;
    if (!first || !/^[A-Z]{3}$/.test(currency) || !/T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/i.test(expiry) ||
      Number.isNaN(Date.parse(expiry)) ||
      !minimum || !maximum || !Number.isFinite(low) || !Number.isFinite(high) || high <= low ||
      (first.market === "tsx" && low < 0) || Math.abs(low) > 1e11 || Math.abs(high) > 1e11 ||
      legs.some(({ contract, quantity, premium, multiplier, upfront, verifiedCurrency, verifiedExpiry }) => !upfront || !contract.expiration || contract.expiration !== expiry.slice(0, 10) ||
        (verifiedCurrency != null && verifiedCurrency !== currency) || (verifiedExpiry != null && Date.parse(verifiedExpiry) !== Date.parse(expiry)) ||
        contract.market !== first.market || contract.underlying !== first.underlying ||
        (first.market === "commodities" && (!first.contract || contract.contract !== first.contract)) ||
        !multiplier || !Number.isFinite(Number(multiplier)) || Number(multiplier) <= 0 ||
        !/^[1-9]\d*$/.test(quantity) || Number(quantity) > 10000 || premium === "" || !Number.isFinite(Number(premium)) || Number(premium) < 0)) {
      setError(t("strategy_002"));
      return;
    }
    const prices = Array.from({ length: 21 }, (_, index) => (low + (high - low) * index / 20).toFixed(6));
    const payload = {
      legs: legs.map(({ contract, direction, quantity, premium, multiplier }) => ({
        symbol: contract.symbol, market: contract.market === "tsx" ? "equity" : "futures",
        underlying: contract.underlying, currency, expiry, side: contract.side, direction,
        strike: String(contract.strike), premium, quantity: Number(quantity), multiplier,
        price_source: "manual assumption", premium_style: "upfront",
      })),
      domain_min: first.market === "tsx" ? "0" : null, domain_max: null, prices,
    };
    setPending(true);
    try {
      const response = await fetch("/api/anatole/api/v1/options/strategy/payoff", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(t("strategy_003"));
      const result = await response.json() as Result;
      setScenarios((current) => [...current, {
        id: Date.now(), result,
        description: `${legs.map((leg) => `${leg.direction} ${leg.quantity} × ${leg.contract.symbol} @ ${leg.premium} (×${leg.multiplier})`).join(" · ")} | ${expiry} | ${minimum}–${maximum}`,
      }].slice(-3));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("strategy_004"));
    } finally {
      setPending(false);
    }
  }

  return <section id="options-strategy-builder" className="op-strategy panel" aria-label={t("strategy_005")}>
    <h2>{t("strategy_006")}</h2>
    <p>{t("strategy_007")}</p>
    <div className="op-strategyLayout"><div className="op-strategyEditor">
    {!legs.length ? <div className="op-strategyEmpty"><strong>{t("strategy_008")}</strong>
      <p>{t("strategy_009")}</p>
      <button type="button" onClick={onChooseContracts}>{t("strategy_010")}</button></div> : null}
    <form onSubmit={(event) => void calculate(event)}>
      <label>{t("strategy_011")}
        <select defaultValue="custom" onChange={(event) => { applyTemplate(event.target.value); event.target.value = "custom"; }}>
          <option value="custom">{t("strategy_012")}</option>
          <option value="long-call">Long call</option><option value="long-put">Long put</option>
          <option value="bull-call">Bull call spread</option><option value="straddle">Long straddle</option>
        </select>
      </label>
      {legs.map(({ id, contract, direction, quantity, premium, multiplier, snapshotStale, snapshotAt, upfront, verifiedCurrency, verifiedExpiry }) => <fieldset key={id}>
        <legend>{contract.symbol} · {contract.side.toUpperCase()} · {contract.strike} · {contract.expiration ?? t("strategy_013")}</legend>
        <p>{contract.bid == null && contract.ask == null ? t("strategy_014") : t("strategy_015")}: Bid {contract.bid ?? "N/D"} · Ask {contract.ask ?? "N/D"} · {contract.source}{contract.delayed || snapshotStale ? ` · ${t("strategy_016")}` : ""}{contract.market === "commodities" ? ` · ${t("strategy_017")}` : ""}</p>
        {snapshotAt ? <p>{t("strategy_018")}: {snapshotAt}</p> : null}
        {verifiedCurrency && verifiedExpiry ? <p>{t("strategy_019")}: {verifiedCurrency} · {verifiedExpiry}</p> : null}
        <div className="op-strategy-fields">
          <label>{t("strategy_020")}<select value={direction} onChange={(event) => updateLeg(id, { direction: event.target.value as "long" | "short" })}><option value="long">{t("strategy_021")}</option><option value="short">{t("strategy_022")}</option></select></label>
          <label>{t("strategy_023")}<input required type="number" min="1" max="10000" step="1" value={quantity} onChange={(event) => updateLeg(id, { quantity: event.target.value })} /></label>
          <label>{t("strategy_024")}<input required type="number" min="0" step="any" value={premium} onChange={(event) => updateLeg(id, { premium: event.target.value })} /></label>
          <label>{t("strategy_025")}<input required type="number" min="0" step="any" value={multiplier} onChange={(event) => updateLeg(id, { multiplier: event.target.value })} /></label>
          <button type="button" onClick={() => setLegs((current) => current.filter((leg) => leg.id !== id))}>{t("strategy_026")}</button>
        </div>
        <label className="op-strategy-confirm"><input type="checkbox" required checked={upfront} onChange={(event) => updateLeg(id, { upfront: event.target.checked })} /><span>{t("strategy_027")}</span></label>
      </fieldset>)}
      <p>{t("strategy_028")}</p>
      <div className="op-strategy-fields">
        <label>{t("strategy_029")}<input required maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="CAD" /></label>
        <label>{t("strategy_030")}<input required value={expiry} onChange={(event) => setExpiry(event.target.value)} placeholder="2027-11-25T16:00:00-05:00" /></label>
        <label>{t("strategy_031")}<input required type="number" step="any" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
        <label>{t("strategy_032")}<input required type="number" step="any" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label>
      </div>
      {error ? <p className="op-error" role="alert">{error}</p> : null}
      <button type="submit" disabled={pending || !legs.length}>{pending ? t("strategy_033") : t("strategy_034")}</button>
    </form>
    </div><div className="op-strategyResults">
    {!scenarios.length ? <div className="op-strategyEmpty"><strong>{t("strategy_035")}</strong><p>{t("strategy_036")}</p></div> : null}
    {scenarios.map((scenario, index) => <ScenarioResult key={scenario.id} scenario={scenario} index={index} language={language} onRemove={() => setScenarios((current) => current.filter((item) => item.id !== scenario.id))} />)}
    <p>{t("strategy_037")}</p>
    </div></div>
  </section>;
}

function ScenarioResult({ scenario, index, language, onRemove }: { scenario: Scenario; index: number; language: "fr" | "en"; onRemove: () => void }) {
  const t = useOptionsText(language);
  const { result } = scenario;
  const points = result.points.map((point) => ({ x: Number(point.price), y: Number(point.profit_loss) }));
  const ys = points.map((point) => point.y);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(0, ...ys);
  const xMin = points[0]?.x ?? 0;
  const xMax = points.at(-1)?.x ?? 1;
  const path = points.map((point, i) => `${i ? "L" : "M"} ${20 + (point.x - xMin) / (xMax - xMin || 1) * 560} ${180 - (point.y - yMin) / (yMax - yMin || 1) * 160}`).join(" ");
  return <article className="op-scenario">
    <h3>{t("strategy_038")} {index + 1}</h3><p>{scenario.description}</p>
    <p>{t("strategy_039")}: {result.theoretical_debit ?? "N/D"} {result.currency}</p>
    <p>{t("strategy_040")}: {result.loss_unbounded ? t("strategy_041") : result.minimum_profit_loss ?? "N/D"} / {result.gain_unbounded ? t("strategy_042") : result.maximum_profit_loss ?? "N/D"} {result.currency}</p>
    <p>{t("strategy_043")}: {result.break_evens.length ? result.break_evens.map((root) => root.lower != null && root.lower === root.upper ? root.lower : `${root.lower ?? "−∞"} – ${root.upper ?? "+∞"}`).join(", ") : t("strategy_044")}</p>
    <svg viewBox="0 0 600 200" role="img" aria-label={t("strategy_045")}>
      <line x1="20" x2="580" y1={180 - (0 - yMin) / (yMax - yMin || 1) * 160} y2={180 - (0 - yMin) / (yMax - yMin || 1) * 160} stroke="currentColor" strokeDasharray="4 4" />
      <path d={path} fill="none" stroke="var(--accent-text)" strokeWidth="3" />
    </svg>
    <details><summary>{t("strategy_046")}</summary><table><thead><tr><th>{t("strategy_047")}</th><th>P/L ({result.currency})</th></tr></thead><tbody>{result.points.map((point, i) => <tr key={i}><td>{point.price}</td><td>{point.profit_loss}</td></tr>)}</tbody></table></details>
    <button type="button" onClick={onRemove}>{t("strategy_048")}</button>
  </article>;
}
