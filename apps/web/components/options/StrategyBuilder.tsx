"use client";

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { pick } from "@/lib/i18n";
import type { OptionContract } from "@/lib/options-api";
import "./strategy-builder.css";

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

export function StrategyBuilder({ legs, setLegs, language }: {
  legs: StrategyLeg[];
  setLegs: Dispatch<SetStateAction<StrategyLeg[]>>;
  language: "fr" | "en";
}) {
  const tr = (fr: string, en: string) => pick(language, fr, en);
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
      setError(tr("Les contrats sélectionnés ne correspondent pas au modèle choisi.", "The selected contracts do not match this template."));
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
      legs.some(({ contract, quantity, premium, multiplier, upfront }) => !upfront || !contract.expiration || contract.expiration !== expiry.slice(0, 10) ||
        contract.market !== first.market || contract.underlying !== first.underlying ||
        (first.market === "commodities" && (!first.contract || contract.contract !== first.contract)) ||
        !multiplier || !Number.isFinite(Number(multiplier)) || Number(multiplier) <= 0 ||
        !/^[1-9]\d*$/.test(quantity) || Number(quantity) > 10000 || premium === "" || !Number.isFinite(Number(premium)) || Number(premium) < 0)) {
      setError(tr("Vérifiez les jambes, les spécifications et la plage de prix. La date et le fuseau de l'échéance sont obligatoires.", "Check the legs, specifications and price range. The expiry date and time zone are required."));
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
      if (!response.ok) throw new Error(tr("Calcul refusé : vérifiez la compatibilité des contrats et leurs spécifications.", "Calculation rejected: check contract compatibility and specifications."));
      const result = await response.json() as Result;
      setScenarios((current) => [...current, {
        id: Date.now(), result,
        description: `${legs.map((leg) => `${leg.direction} ${leg.quantity} × ${leg.contract.symbol} @ ${leg.premium} (×${leg.multiplier})`).join(" · ")} | ${expiry} | ${minimum}–${maximum}`,
      }].slice(-3));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("Calcul indisponible.", "Calculation unavailable."));
    } finally {
      setPending(false);
    }
  }

  return <section id="options-strategy-builder" className="op-strategy panel" aria-label={tr("Constructeur de stratégie", "Strategy builder")}>
    <h2>{tr("Constructeur de stratégie", "Strategy builder")}</h2>
    <p>{tr("Simulation théorique à une échéance, à partir d'hypothèses saisies. Les primes saisies ne sont pas des cotations vérifiées.", "Theoretical single-expiry simulation using entered assumptions. Entered premiums are not verified quotes.")}</p>
    <p>{tr("Les options à prime de type futures, les échéances mixtes et les devises différentes ne sont pas prises en charge.", "Futures-style premium margining, mixed expiries and currencies are not supported.")}</p>
    <form onSubmit={(event) => void calculate(event)}>
      <label>{tr("Stratégie prédéfinie", "Strategy template")}
        <select defaultValue="custom" onChange={(event) => { applyTemplate(event.target.value); event.target.value = "custom"; }}>
          <option value="custom">{tr("Personnalisée", "Custom")}</option>
          <option value="long-call">Long call</option><option value="long-put">Long put</option>
          <option value="bull-call">Bull call spread</option><option value="straddle">Long straddle</option>
        </select>
      </label>
      {!legs.length ? <p>{tr("Choisissez des contrats dans la chaîne et ajoutez-les à la stratégie.", "Choose contracts in the chain and add them to the strategy.")}</p> : null}
      {legs.map(({ id, contract, direction, quantity, premium, multiplier, snapshotStale, snapshotAt, upfront }) => <fieldset key={id}>
        <legend>{contract.symbol} · {contract.side.toUpperCase()} · {contract.strike} · {contract.expiration ?? tr("Échéance inconnue", "Unknown expiry")}</legend>
        <p>{tr("Marché observé", "Observed market")}: Bid {contract.bid ?? "N/D"} · Ask {contract.ask ?? "N/D"} · {contract.source}{contract.delayed || snapshotStale ? ` · ${tr("différé ou périmé", "delayed or stale")}` : ""}{contract.market === "commodities" ? ` · ${tr("fraîcheur de cotation à confirmer", "quote freshness unconfirmed")}` : ""}</p>
        {snapshotAt ? <p>{tr("Instantané récupéré", "Snapshot retrieved")}: {snapshotAt}</p> : null}
        <div className="op-strategy-fields">
          <label>{tr("Sens", "Direction")}<select value={direction} onChange={(event) => updateLeg(id, { direction: event.target.value as "long" | "short" })}><option value="long">{tr("Achat", "Buy")}</option><option value="short">{tr("Vente", "Sell")}</option></select></label>
          <label>{tr("Quantité", "Quantity")}<input required type="number" min="1" max="10000" step="1" value={quantity} onChange={(event) => updateLeg(id, { quantity: event.target.value })} /></label>
          <label>{tr("Prime hypothétique par unité", "Hypothetical premium per unit")}<input required type="number" min="0" step="any" value={premium} onChange={(event) => updateLeg(id, { premium: event.target.value })} /></label>
          <label>{tr("Multiplicateur vérifié", "Verified multiplier")}<input required type="number" min="0" step="any" value={multiplier} onChange={(event) => updateLeg(id, { multiplier: event.target.value })} /></label>
          <button type="button" onClick={() => setLegs((current) => current.filter((leg) => leg.id !== id))}>{tr("Retirer", "Remove")}</button>
        </div>
        <label className="op-strategy-confirm"><input type="checkbox" required checked={upfront} onChange={(event) => updateLeg(id, { upfront: event.target.checked })} /><span>{tr("J'ai vérifié que ce contrat utilise une prime payée initialement.", "I verified that this contract uses an upfront premium.")}</span></label>
      </fieldset>)}
      <p>{tr("Renseignez les spécifications vérifiées du contrat. Le calcul suppose une prime payée initialement.", "Enter verified contract specifications. The calculation assumes an upfront premium.")}</p>
      <div className="op-strategy-fields">
        <label>{tr("Devise commune vérifiée (ISO)", "Verified common currency (ISO)")}<input required maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="CAD" /></label>
        <label>{tr("Échéance avec fuseau", "Expiry with time zone")}<input required value={expiry} onChange={(event) => setExpiry(event.target.value)} placeholder="2027-11-25T16:00:00-05:00" /></label>
        <label>{tr("Sous-jacent minimum simulé", "Simulated underlying minimum")}<input required type="number" step="any" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
        <label>{tr("Sous-jacent maximum simulé", "Simulated underlying maximum")}<input required type="number" step="any" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label>
      </div>
      {error ? <p className="op-error" role="alert">{error}</p> : null}
      <button type="submit" disabled={pending || !legs.length}>{pending ? tr("Calcul…", "Calculating…") : tr("Calculer un scénario", "Calculate scenario")}</button>
    </form>
    {scenarios.map((scenario, index) => <ScenarioResult key={scenario.id} scenario={scenario} index={index} language={language} onRemove={() => setScenarios((current) => current.filter((item) => item.id !== scenario.id))} />)}
    <p>{tr("Résultat à l'échéance uniquement. Frais, fiscalité, change, financement, marge, exercice anticipé, assignation et règlement sont exclus. Aucune recommandation.", "Expiration payoff only. Fees, taxes, FX, financing, margin, early exercise, assignment and settlement are excluded. Not a recommendation.")}</p>
  </section>;
}

function ScenarioResult({ scenario, index, language, onRemove }: { scenario: Scenario; index: number; language: "fr" | "en"; onRemove: () => void }) {
  const tr = (fr: string, en: string) => pick(language, fr, en);
  const { result } = scenario;
  const points = result.points.map((point) => ({ x: Number(point.price), y: Number(point.profit_loss) }));
  const ys = points.map((point) => point.y);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(0, ...ys);
  const xMin = points[0]?.x ?? 0;
  const xMax = points.at(-1)?.x ?? 1;
  const path = points.map((point, i) => `${i ? "L" : "M"} ${20 + (point.x - xMin) / (xMax - xMin || 1) * 560} ${180 - (point.y - yMin) / (yMax - yMin || 1) * 160}`).join(" ");
  return <article className="op-scenario">
    <h3>{tr("Scénario", "Scenario")} {index + 1}</h3><p>{scenario.description}</p>
    <p>{tr("Débit théorique", "Theoretical debit")}: {result.theoretical_debit ?? "N/D"} {result.currency}</p>
    <p>{tr("Perte / gain", "Loss / gain")}: {result.loss_unbounded ? tr("illimitée", "unbounded") : result.minimum_profit_loss ?? "N/D"} / {result.gain_unbounded ? tr("illimité", "unbounded") : result.maximum_profit_loss ?? "N/D"} {result.currency}</p>
    <p>{tr("Seuils de rentabilité", "Break-even")}: {result.break_evens.length ? result.break_evens.map((root) => root.lower != null && root.lower === root.upper ? root.lower : `${root.lower ?? "−∞"} – ${root.upper ?? "+∞"}`).join(", ") : tr("aucun", "none")}</p>
    <svg viewBox="0 0 600 200" role="img" aria-label={tr("Profits et pertes à l'échéance selon le sous-jacent", "Expiration profit and loss by underlying price")}>
      <line x1="20" x2="580" y1={180 - (0 - yMin) / (yMax - yMin || 1) * 160} y2={180 - (0 - yMin) / (yMax - yMin || 1) * 160} stroke="currentColor" strokeDasharray="4 4" />
      <path d={path} fill="none" stroke="var(--accent-text)" strokeWidth="3" />
    </svg>
    <details><summary>{tr("Valeurs simulées", "Simulated values")}</summary><table><thead><tr><th>{tr("Sous-jacent", "Underlying")}</th><th>P/L ({result.currency})</th></tr></thead><tbody>{result.points.map((point, i) => <tr key={i}><td>{point.price}</td><td>{point.profit_loss}</td></tr>)}</tbody></table></details>
    <button type="button" onClick={onRemove}>{tr("Retirer ce scénario", "Remove scenario")}</button>
  </article>;
}
