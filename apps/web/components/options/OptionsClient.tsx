"use client";

import { RefreshCw, Search } from "@/components/layout/AppIcons";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useAssistantContext } from "@/components/assistant/AssistantContextProvider";
import { pick } from "@/lib/i18n";
import {
  getOptionChain,
  getOptionsUniverse,
  type OptionChainSnapshot,
  type OptionContract,
  type OptionMarket,
  type OptionSourceStatus,
  type OptionUniverseSnapshot,
} from "@/lib/options-api";

import "./options.css";
import { PremiumChain } from "./PremiumChain";
import type { StrategyLeg } from "./StrategyBuilder";
import type { TrackedOption } from "./options-positions";

const StrategyBuilder = dynamic(() => import("./StrategyBuilder").then((module) => module.StrategyBuilder), { ssr: false });
const VolatilityIntelligence = dynamic(() => import("./VolatilityIntelligence").then((module) => module.VolatilityIntelligence), { ssr: false });
const OptionsScreener = dynamic(() => import("./OptionsScreener").then((module) => module.OptionsScreener), { ssr: false });
const OptionsPortfolio = dynamic(() => import("./OptionsPortfolio").then((module) => module.OptionsPortfolio), { ssr: false });

type SideFilter = "both" | "call" | "put";

function SelectControl({ label, value, onChange, disabled, children }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean; children: ReactNode;
}) {
  return <label className="op-selectControl"><span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select>
  </label>;
}

function settleRequest<T>(request: Promise<T>, controller: AbortController, setData: (data: T) => void,
  setError: (error: string | null) => void, setLoading: (loading: boolean) => void, fallback: string) {
  void request.then((data) => { if (!controller.signal.aborted) { setData(data); setError(null); } }).catch((reason: unknown) => {
    if (!controller.signal.aborted && (reason as Error)?.name !== "AbortError") setError(reason instanceof Error ? reason.message : fallback);
  }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
}

function value(
  number: number | null | undefined,
  digits = 2,
): string {
  return number == null || !Number.isFinite(number)
    ? "N/D"
    : number.toLocaleString("fr-CA", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

function integer(number: number | null | undefined): string {
  return number == null || !Number.isFinite(number)
    ? "N/D"
    : Math.round(number).toLocaleString("fr-CA");
}

function ratio(number: number | null | undefined): string {
  return number == null || !Number.isFinite(number)
    ? "N/D"
    : number.toFixed(2);
}

function Status({ item }: { item: OptionSourceStatus }) {
  return (
    <div className={"op-status"}>
      <span className={`op-dot op-${item.status}`} />
      <div>
        <strong>{item.source}</strong>
        <small>{item.detail ?? item.status}</small>
      </div>
    </div>
  );
}

export function OptionsClient() {
  const symbol = useSearchParams().get("symbol");
  return <OptionsContent key={symbol === null ? "default" : `symbol:${symbol}`} requestedSymbol={symbol} />;
}

function OptionsContent({ requestedSymbol: rawSymbol }: { requestedSymbol: string | null }) {
  const { preferences } = usePreferences();
  const { openAssistant } = useAssistantContext();
  const language = preferences.language;
  const requestedSymbol = rawSymbol?.trim().toUpperCase().replace(/\.TO$/, "");
  const initialSymbol = requestedSymbol === undefined ? "RY" : /^[A-Z0-9.^-]{1,16}$/.test(requestedSymbol) ? requestedSymbol : "";
  const [market, setMarket] = useState<OptionMarket>("tsx");
  const [universe, setUniverse] = useState<OptionUniverseSnapshot | null>(null);
  const [chain, setChain] = useState<OptionChainSnapshot | null>(null);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [draftSymbol, setDraftSymbol] = useState(initialSymbol);
  const [expiration, setExpiration] = useState("");
  const [side, setSide] = useState<SideFilter>("both");
  const [category, setCategory] = useState("all");
  const [loadingUniverse, setLoadingUniverse] = useState(true);
  const [loadingChain, setLoadingChain] = useState(Boolean(initialSymbol));
  const [universeError, setUniverseError] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(initialSymbol ? null : pick(language, "Symbole invalide.", "Invalid symbol."));
  const [refreshKey, setRefreshKey] = useState(0);
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [showStrategy, setShowStrategy] = useState(false);
  const [showVolatility, setShowVolatility] = useState(false);
  const [showScreener, setShowScreener] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [trackedContract, setTrackedContract] = useState<OptionContract | null>(null);
  const nextLegId = useRef(0);

  function addStrategyLeg(contract: OptionContract) {
    if (legs.length >= 20) {
      setChainError(pick(language, "La stratégie est limitée à 20 jambes.", "A strategy is limited to 20 legs."));
      return false;
    }
    setChainError(null);
    const id = nextLegId.current++;
    setLegs((current) => current.length >= 20 ? current : [...current, { id, contract, direction: "long", quantity: "1", premium: "", multiplier: "", snapshotStale: chain?.stale ?? false, snapshotAt: chain?.generated_at ?? "", upfront: false }]);
    setShowStrategy(true);
    return true;
  }

  function analyzeTracked(position: TrackedOption) {
    if (legs.length >= 20) return false;
    const matches = chain?.contracts.filter((item) => item.symbol === position.symbol && item.market === position.market &&
      item.underlying === position.underlying && item.contract === position.contract && item.expiration === position.expiration &&
      item.side === position.side && item.strike === position.strike) ?? [];
    const contract: OptionContract = matches.length === 1 ? matches[0] : {
      symbol: position.symbol, underlying: position.underlying, market: position.market, contract: position.contract,
      side: position.side, strike: position.strike, expiration: position.expiration, exchange: "",
      bid: null, ask: null, last: null, change: null, percent_change: null, volume: null, open_interest: null,
      implied_volatility: null, delta: null, gamma: null, theta: null, vega: null, in_the_money: null,
      source: pick(language, "saisie utilisateur", "user entry"), delayed: true,
    };
    const id = nextLegId.current++;
    setLegs((current) => current.length >= 20 ? current : [...current, { id, contract, direction: position.direction,
      quantity: String(position.quantity), premium: String(position.premium), multiplier: String(position.multiplier),
      upfront: true, verifiedCurrency: position.currency, verifiedExpiry: position.expiry_at,
      snapshotStale: matches.length !== 1 || (chain?.stale ?? true), snapshotAt: matches.length === 1 ? chain?.generated_at ?? "" : "" }]);
    setShowStrategy(true);
    return true;
  }

  useEffect(() => {
    const controller = new AbortController();
    settleRequest(getOptionsUniverse(market, controller.signal), controller, setUniverse, setUniverseError, setLoadingUniverse,
      pick(language, "Univers d'options indisponible.", "Options universe unavailable."));
    return () => controller.abort();
  }, [language, market, refreshKey]);

  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    settleRequest(getOptionChain(market, symbol, expiration || undefined, controller.signal), controller,
      setChain, setChainError, setLoadingChain, pick(language, "Chaîne d'options indisponible.", "Options chain unavailable."));
    return () => controller.abort();
  }, [expiration, language, market, refreshKey, symbol]);

  const categories = useMemo(() => {
    const items = universe?.items ?? [];
    return ["all", ...Array.from(new Set(items.map((item) => item.category))).sort()];
  }, [universe]);

  const universeItems = useMemo(() => {
    const items = universe?.items ?? [];
    return category === "all"
      ? items
      : items.filter((item) => item.category === category);
  }, [category, universe]);

  const contracts = useMemo(() => {
    const items = chain?.contracts ?? [];
    return side === "both" ? items : items.filter((item) => item.side === side);
  }, [chain, side]);

  const statuses = useMemo(
    () =>
      [
        ...(universe?.source_statuses ?? []),
        ...(chain?.source_statuses ?? []),
      ],
    [chain, universe],
  );

  function changeMarket(next: OptionMarket) {
    if (next === market) return;
    const nextSymbol = next === "tsx" ? "RY" : "GC";
    setLoadingUniverse(true);
    setLoadingChain(true);
    setMarket(next);
    setSymbol(nextSymbol);
    setDraftSymbol(nextSymbol);
    setExpiration("");
    setCategory("all");
    setSide("both");
    setChain(null);
  }

  function submitSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draftSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9.^-]{1,16}$/.test(next)) {
      setChainError(pick(language, "Symbole invalide.", "Invalid symbol."));
      return;
    }
    chooseSymbol(next);
  }

  function chooseSymbol(next: string) {
    setChainError(null);
    if (next === symbol && !expiration) return;
    setLoadingChain(true);
    if (next !== symbol) setChain(null);
    setDraftSymbol(next);
    setSymbol(next);
    setExpiration("");
  }

  const analytics = chain?.analytics;
  const metrics = [
    [pick(language, "Contrats", "Contracts"), analytics ? integer(analytics.contract_count) : "—", chain ? `${chain.name} · ${chain.exchange}` : symbol],
    ["Put / Call · Vol.", analytics?.put_call_volume_ratio == null ? null : ratio(analytics.put_call_volume_ratio), `${integer(analytics?.put_volume)} P / ${integer(analytics?.call_volume)} C`],
    ["Put / Call · OI", analytics?.put_call_open_interest_ratio == null ? null : ratio(analytics.put_call_open_interest_ratio), `${integer(analytics?.put_open_interest)} P / ${integer(analytics?.call_open_interest)} C`],
    ["IV ATM", analytics?.atm_implied_volatility == null ? null : `${value(analytics.atm_implied_volatility, 1)} %`, pick(language, "Fournisseur ou estimation Anatole", "Provider or Anatole estimate")],
    [pick(language, "Max pain estimé", "Estimated max pain"), analytics?.max_pain_estimate == null ? null : value(analytics.max_pain_estimate), pick(language, "Calcul descriptif à partir de l'OI", "Descriptive calculation from OI")],
  ];

  return (
    <main className={"op-page"}>
      <header className="panel op-hero">
        <div>
          <span className="eyebrow">
            {pick(language, "DÉRIVÉS · OPTIONS", "DERIVATIVES · OPTIONS")}
          </span>
          <h1>{pick(language, "Options", "Options")}</h1>
          <p>
            {pick(
              language,
              "Options canadiennes et sur contrats à terme.",
              "Canadian and futures options.",
            )}
          </p>
        </div>
        <button type="button" className="op-vol-toggle" disabled={!chain} aria-pressed={showVolatility} onClick={() => setShowVolatility(!showVolatility)}>
          {pick(language, "Intelligence de volatilité", "Volatility intelligence")}
        </button>
        <button type="button" className="op-vol-toggle" disabled={!chain} aria-pressed={showScreener} onClick={() => setShowScreener(!showScreener)}>
          {pick(language, "Screener de contrats", "Contract screener")}
        </button>
        <button type="button" className="op-vol-toggle" aria-pressed={showPortfolio} onClick={() => setShowPortfolio(!showPortfolio)}>
          {pick(language, "Positions d'options", "Options positions")}
        </button>
      </header>

      <section className="panel op-integrations" aria-label={pick(language, "Assistant et autres espaces", "Assistant and other spaces")}>
        {chain?.market === "tsx" && /^[A-Z^][A-Z0-9.^-]{0,14}$/.test(chain.symbol) ? <a href={`/focus/${chain.symbol}`}>{pick(language, `Voir ${chain.symbol} dans Focus`, `View ${chain.symbol} in Focus`)}</a> : null}
        <a href="/portefeuille">{pick(language, "Ouvrir Portefeuille", "Open Portfolio")}</a>
        {chain?.market === "tsx" && !loadingChain && chain.symbol === symbol && <button type="button" className="op-vol-toggle" onClick={() => openAssistant({ symbol: chain.symbol, symbols: [chain.symbol], metadata: { options_market: chain.market, options_expiration: chain.requested_expiration ?? "" } })}>{pick(language, `Interroger Anatole sur la chaîne ${chain.symbol}`, `Ask Anatole about the ${chain.symbol} chain`)}</button>}
        <p>{pick(language, "La chaîne sélectionnée peut être rechargée par l'assistant ; les positions et scénarios locaux ne sont pas transmis. Le suivi local n'est pas synchronisé avec Portefeuille.", "The assistant can reload the selected chain; local positions and scenarios are not sent. Local tracking is not synced with Portfolio.")}</p>
      </section>

      <section className="panel op-controls">
        <div className={"op-marketTabs"}>
          <button
            type="button"
            className={market === "tsx" ? "op-activeTab" : undefined}
            onClick={() => changeMarket("tsx")}
          >
            {pick(language, "Canada · Montréal", "Canada · Montréal")}
          </button>
          <button
            type="button"
            className={market === "commodities" ? "op-activeTab" : undefined}
            onClick={() => changeMarket("commodities")}
          >
            {pick(language, "Matières premières", "Commodities")}
          </button>
        </div>

        <div className={"op-controlGrid"}>
          <form className={"op-symbolForm"} onSubmit={submitSymbol}>
            <label>
              <span>{pick(language, "Sous-jacent / racine", "Underlying / root")}</span>
              <div>
                <Search size={17} />
                <input
                  value={draftSymbol}
                  onChange={(event) => setDraftSymbol(event.target.value)}
                  placeholder={market === "tsx" ? "RY, TD, XIU…" : "GC, CL, ZC…"}
                />
                <button type="submit">{pick(language, "Charger", "Load")}</button>
              </div>
            </label>
          </form>

          <SelectControl label={pick(language, "Catégorie", "Category")} value={category} onChange={setCategory}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? pick(language, "Toutes", "All") : item}
                </option>
              ))}
          </SelectControl>

          <SelectControl label={pick(language, "Échéance", "Expiry")}
              value={expiration}
              onChange={(next) => {
                setLoadingChain(true);
                setExpiration(next);
              }}
              disabled={!chain?.expirations.length}
            >
              <option value="">{pick(language, "Toutes / plus proche", "All / nearest")}</option>
              {chain?.expirations.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
          </SelectControl>

          <SelectControl label="Type" value={side} onChange={(next) => setSide(next as SideFilter)}>
              <option value="both">Call + Put</option>
              <option value="call">Calls</option>
              <option value="put">Puts</option>
          </SelectControl>

          <button
            type="button"
            className={"op-refreshButton"}
            onClick={() => {
              setLoadingUniverse(true);
              setLoadingChain(true);
              setRefreshKey((current) => current + 1);
            }}
            disabled={loadingUniverse || loadingChain}
          >
            <RefreshCw className={loadingUniverse || loadingChain ? "op-spin" : undefined} size={17} />
            {pick(language, "Actualiser", "Refresh")}
          </button>
        </div>

        <div className={"op-shortcuts"}>
          {loadingUniverse ? (
            <span>{pick(language, "Chargement de l'univers…", "Loading universe…")}</span>
          ) : (
            universeItems.slice(0, 80).map((item) => (
              <button
                type="button"
                key={`${item.provider_symbol}-${item.symbol}`}
                className={symbol === item.symbol ? "op-selectedShortcut" : undefined}
                onClick={() => chooseSymbol(item.symbol)}
                title={item.name}
              >
                <strong>{item.symbol}</strong>
                <small>{item.name}</small>
              </button>
            ))
          )}
        </div>
      </section>

      {[universeError, chainError].map((error, index) => error ? <div className={"op-error"} role="alert" key={index}>{error}</div> : null)}

      <section className={"op-metrics"}>
        {metrics.map(([label, result, detail]) => result == null ? null : <article className="panel" key={label}>
          <span>{label}</span><strong>{result}</strong><small>{detail}</small>
        </article>)}
      </section>

      <details className="panel op-dataState">
        <summary>{pick(language, "État des données", "Data status")}</summary>
        <div className={"op-sourcePanel"}>
        <div>
          <p>
            {market === "tsx"
              ? pick(
                  language,
                  "Bourse de Montréal et fournisseurs ; IV et Greeks parfois estimés par Black-Scholes.",
                  "Montréal Exchange and providers; IV and Greeks may be Black-Scholes estimates.",
                )
              : pick(
                  language,
                  "Instantanés issus d'une source autorisée ; couverture variable et cotations parfois différées.",
                  "Snapshots from an authorized source; coverage varies and quotes may be delayed.",
                )}
          </p>
        </div>
        <div className={"op-statuses"}>
          {statuses.map((item, index) => (
            <Status item={item} key={`${item.source}-${item.status}-${index}`} />
          ))}
        </div>
        </div>
      </details>

      <section className="panel op-chainPanel">
        <div className={"op-chainHeader"}>
          <div>
            <span className="eyebrow">{market === "tsx" ? "MX" : "COMMODITIES"}</span>
            <h2>{chain ? `${chain.symbol} · ${chain.name}` : symbol}</h2>
            <p>
              {chain?.underlying_price != null
                ? `${pick(language, "Sous-jacent", "Underlying")}: ${value(chain.underlying_price)}`
                : pick(language, "Prix du sous-jacent non fourni par cette source.", "Underlying price not supplied by this source.")}
            </p>
            {market === "commodities" && chain?.contracts.length ? <p>
              {pick(language, "Instantané récupéré", "Snapshot retrieved")}: {new Date(chain.generated_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}
              {chain.stale ? ` · ${pick(language, "instantané périmé", "stale snapshot")}` : ""}
              {` · ${pick(language, "fraîcheur des cotations à confirmer", "quote freshness unconfirmed")}`}
            </p> : null}
          </div>
          <div className={"op-chainMeta"}>
            <strong>{contracts.length.toLocaleString("fr-CA")}</strong>
            <span>{pick(language, "contrats chargés", "contracts loaded")}</span>
          </div>
        </div>

        {loadingChain && !chain ? (
          <div className={"op-empty"}>
            {pick(language, "Chargement de la chaîne…", "Loading option chain…")}
          </div>
        ) : contracts.length ? (
          <PremiumChain contracts={contracts} underlying={chain?.underlying_price ?? null}
            stale={chain?.stale ?? false} language={language} display={value} onAddStrategy={addStrategyLeg} />
        ) : (
          <div className={"op-empty"}>
            <strong>{pick(language, "Aucune chaîne exploitable pour l'instant.", "No usable chain yet.")}</strong>
            <span>
              {market === "commodities"
                ? pick(
                    language,
                    "Source autorisée et collecte configurée nécessaires.",
                    "Authorized source and configured ingestion required.",
                  )
                : pick(
                    language,
                    "La chaîne peut être absente chez le fournisseur.",
                    "The provider may not have this chain.",
                  )}
            </span>
          </div>
        )}
      </section>

      {showStrategy ? <StrategyBuilder legs={legs} setLegs={setLegs} language={language} /> : null}
      {showVolatility && chain ? <VolatilityIntelligence chain={chain} language={language} /> : null}
      {showScreener && chain ? <OptionsScreener chain={chain} language={language} onAddStrategy={addStrategyLeg} onTrack={(contract) => { setTrackedContract(contract); setShowPortfolio(true); }} /> : null}
      {showPortfolio ? <OptionsPortfolio chain={chain} selected={trackedContract} language={language} onAnalyze={analyzeTracked} /> : null}

      <p className={"op-disclaimer"}>
        {pick(
          language,
          "* Vol. : séance ; OI : intérêt ouvert ; N/D : donnée absente. Nature du prix fourni à confirmer. Cotations parfois différées.",
          "* Vol.: session; OI: open interest; N/D: missing. Provider price type unconfirmed. Quotes may be delayed.",
        )}
      </p>
    </main>
  );
}
