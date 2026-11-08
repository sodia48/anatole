"use client";

import { RefreshCw, Search } from "@/components/layout/AppIcons";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useAssistantContext } from "@/components/assistant/AssistantContextProvider";
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
import { useOptionsText } from "./OptionsCopyProvider";
import { PremiumChain } from "./PremiumChain";
import type { StrategyLeg } from "./StrategyBuilder";
import type { TrackedOption } from "./options-positions";

const StrategyBuilder = dynamic(() => import("./StrategyBuilder").then((module) => module.StrategyBuilder), { ssr: false });
const VolatilityIntelligence = dynamic(() => import("./VolatilityIntelligence").then((module) => module.VolatilityIntelligence), { ssr: false });
const OptionsScreener = dynamic(() => import("./OptionsScreener").then((module) => module.OptionsScreener), { ssr: false });
const OptionsPortfolio = dynamic(() => import("./OptionsPortfolio").then((module) => module.OptionsPortfolio), { ssr: false });

type SideFilter = "both" | "call" | "put";
type Workspace = "chain" | "strategies" | "volatility" | "portfolio";
type ChainView = "quotes" | "screener";
const WORKSPACES: Workspace[] = ["chain", "strategies", "volatility", "portfolio"];
const SYMBOL_KEY = "anatole.options.symbol.v2";
const RECENT_KEY = "anatole.options.recent.v2";
const FAVORITES_KEY = "anatole.options.favorites.v2";

function storedSymbols(key: string): string[] {
  try {
    const values: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string" && /^[A-Z0-9.^-]{1,16}$/.test(value)).slice(0, 12) : [];
  } catch { return []; }
}

function workspaceFrom(value: string | null): Workspace {
  return WORKSPACES.find((item) => item === value) ?? "chain";
}

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
  const params = useSearchParams();
  const rawSymbol = params.get("symbol");
  const { preferences } = usePreferences();
  const { openAssistant } = useAssistantContext();
  const language = preferences.language;
  const t = useOptionsText(language);
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
  const [chainError, setChainError] = useState<string | null>(initialSymbol ? null : t("client_001"));
  const [refreshKey, setRefreshKey] = useState(0);
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(() => workspaceFrom(params.get("workspace")));
  const [chainView, setChainView] = useState<ChainView>(params.get("view") === "screener" ? "screener" : "quotes");
  const [visited, setVisited] = useState<Workspace[]>([workspaceFrom(params.get("workspace"))]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [screenerOpened, setScreenerOpened] = useState(params.get("view") === "screener");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [symbolReady, setSymbolReady] = useState(rawSymbol !== null);
  const [trackedContract, setTrackedContract] = useState<OptionContract | null>(null);
  const [appliedQuery, setAppliedQuery] = useState(rawSymbol);
  const nextLegId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFavorites(storedSymbols(FAVORITES_KEY));
      setRecent(storedSymbols(RECENT_KEY));
      if (rawSymbol === null) {
        try {
          const saved = window.localStorage.getItem(`${SYMBOL_KEY}.tsx`);
          if (saved && /^[A-Z0-9.^-]{1,16}$/.test(saved)) { setSymbol(saved); setDraftSymbol(saved); }
        } catch { /* Storage is optional. */ }
        setSymbolReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rawSymbol]);

  useEffect(() => {
    const sync = () => {
      const url = new URL(window.location.href);
      const workspace = workspaceFrom(url.searchParams.get("workspace"));
      setActiveWorkspace(workspace);
      setChainView(url.searchParams.get("view") === "screener" ? "screener" : "quotes");
      setVisited((current) => current.includes(workspace) ? current : [...current, workspace]);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function navigate(workspace: Workspace, view: ChainView = chainView) {
    const url = new URL(window.location.href);
    if (workspace === "chain") {
      url.searchParams.delete("workspace");
      if (view === "screener") url.searchParams.set("view", "screener");
      else url.searchParams.delete("view");
    } else {
      url.searchParams.set("workspace", workspace);
      url.searchParams.delete("view");
    }
    window.history.pushState(null, "", url);
    setActiveWorkspace(workspace);
    setChainView(view);
    if (view === "screener" && workspace === "chain") setScreenerOpened(true);
    setVisited((current) => current.includes(workspace) ? current : [...current, workspace]);
  }

  if (appliedQuery !== rawSymbol) {
    setAppliedQuery(rawSymbol);
    setSymbol(initialSymbol);
    setDraftSymbol(initialSymbol);
    if (market !== "tsx") { setMarket("tsx"); setLoadingUniverse(true); setCategory("all"); }
    setExpiration("");
    setChain(null);
    setTrackedContract(null);
    setLoadingChain(Boolean(initialSymbol));
    setChainError(initialSymbol ? null : t("client_002"));
  }

  function addStrategyLeg(contract: OptionContract) {
    if (legs.some((leg) => leg.contract.market === contract.market && leg.contract.underlying === contract.underlying &&
      leg.contract.contract === contract.contract && leg.contract.symbol === contract.symbol &&
      leg.contract.expiration === contract.expiration && leg.contract.side === contract.side && leg.contract.strike === contract.strike)) {
      navigate("strategies");
      return true;
    }
    if (legs.length >= 20) {
      setChainError(t("client_003"));
      return false;
    }
    setChainError(null);
    const id = nextLegId.current++;
    setLegs((current) => current.length >= 20 ? current : [...current, { id, contract, direction: "long", quantity: "1", premium: "", multiplier: "", snapshotStale: chain?.stale ?? false, snapshotAt: chain?.generated_at ?? "", upfront: false }]);
    navigate("strategies");
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
      source: t("client_004"), delayed: true,
    };
    const id = nextLegId.current++;
    setLegs((current) => current.length >= 20 ? current : [...current, { id, contract, direction: position.direction,
      quantity: String(position.quantity), premium: String(position.premium), multiplier: String(position.multiplier),
      upfront: true, verifiedCurrency: position.currency, verifiedExpiry: position.expiry_at,
      snapshotStale: matches.length !== 1 || (chain?.stale ?? true), snapshotAt: matches.length === 1 ? chain?.generated_at ?? "" : "" }]);
    navigate("strategies");
    return true;
  }

  useEffect(() => {
    const controller = new AbortController();
    settleRequest(getOptionsUniverse(market, controller.signal), controller, setUniverse, setUniverseError, setLoadingUniverse,
      t("client_005"));
    return () => controller.abort();
  }, [language, market, refreshKey, t]);

  useEffect(() => {
    if (!symbol || !symbolReady) return;
    const controller = new AbortController();
    settleRequest(getOptionChain(market, symbol, expiration || undefined, controller.signal), controller,
      setChain, setChainError, setLoadingChain, t("client_006"));
    return () => controller.abort();
  }, [expiration, language, market, refreshKey, symbol, symbolReady, t]);

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

  const suggestions = useMemo(() => {
    const query = draftSymbol.trim().toUpperCase();
    if (!query || query === symbol) return [];
    return universeItems.filter((item) => item.symbol.startsWith(query) || item.name.toUpperCase().includes(query))
      .sort((a, b) => Number(b.symbol === query) - Number(a.symbol === query) || a.symbol.localeCompare(b.symbol)).slice(0, 6);
  }, [draftSymbol, symbol, universeItems]);

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
    let nextSymbol = next === "tsx" ? "RY" : "GC";
    try {
      const saved = window.localStorage.getItem(`${SYMBOL_KEY}.${next}`);
      if (saved && /^[A-Z0-9.^-]{1,16}$/.test(saved)) nextSymbol = saved;
    } catch { /* Storage is optional. */ }
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
      setChainError(t("client_007"));
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
    try {
      window.localStorage.setItem(`${SYMBOL_KEY}.${market}`, next);
      const updated = [next, ...recent.filter((item) => item !== next)].slice(0, 6);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      setRecent(updated);
    } catch { /* Storage is optional. */ }
  }

  const analytics = chain?.analytics;
  const metrics = [
    ["Put / Call · Vol.", analytics?.put_call_volume_ratio == null ? null : ratio(analytics.put_call_volume_ratio), `${integer(analytics?.put_volume)} P / ${integer(analytics?.call_volume)} C`],
    ["Put / Call · OI", analytics?.put_call_open_interest_ratio == null ? null : ratio(analytics.put_call_open_interest_ratio), `${integer(analytics?.put_open_interest)} P / ${integer(analytics?.call_open_interest)} C`],
    ["IV ATM", analytics?.atm_implied_volatility == null ? null : `${value(analytics.atm_implied_volatility, 1)} %`, t("client_008")],
    [t("client_009"), analytics?.max_pain_estimate == null ? null : value(analytics.max_pain_estimate), t("client_010")],
  ];

  function toggleFavorite() {
    const updated = favorites.includes(symbol) ? favorites.filter((item) => item !== symbol) : [symbol, ...favorites].slice(0, 12);
    setFavorites(updated);
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated)); } catch { /* Storage is optional. */ }
  }

  return (
    <main className={"op-page"}>
      <header className="panel op-terminalHeader">
        <div className="op-terminalIdentity">
          <span className="eyebrow">ANATOLE OPTIONS PRO</span>
          <h1>{chain ? `${chain.symbol} · ${chain.name}` : symbol || t("client_011")}</h1>
          <span>{market === "tsx" ? t("client_012") : t("client_013")}{chain ? ` · ${chain.exchange}` : ""}</span>
        </div>
        <div className="op-terminalQuote">
          <strong>{chain?.underlying_price == null ? "N/D" : value(chain.underlying_price)}</strong>
          <span>{t("client_014")}</span>
          <small>{chain?.stale ? t("client_015") : chain ? t("client_016") : t("client_017")}{chain ? ` · ${new Date(chain.generated_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}` : ""}</small>
        </div>
        <div className="op-terminalTools" role="region" aria-label={t("client_018")}>
          {chain?.market === "tsx" && /^[A-Z^][A-Z0-9.^-]{0,14}$/.test(chain.symbol) ? <a href={`/focus/${chain.symbol}`}>{t("client_019")}</a> : null}
          <a href="/portefeuille">{t("client_020")}</a>
          <button type="button" disabled={chain?.market !== "tsx" || loadingChain || chain?.symbol !== symbol} onClick={() => chain && openAssistant({ symbol: chain.symbol, symbols: [chain.symbol], metadata: { options_market: chain.market, options_expiration: chain.requested_expiration ?? "" } })}>{t("client_021")}</button>
        </div>
      </header>
      <nav className="op-workspaceNav" aria-label={t("client_022")}>
        {([ ["chain", t("client_023")], ["strategies", t("client_024")],
          ["volatility", t("client_025")], ["portfolio", t("client_026")] ] as const).map(([workspace, label]) =>
          <button key={workspace} type="button" className={activeWorkspace === workspace ? "op-workspaceActive" : undefined}
            aria-current={activeWorkspace === workspace ? "page" : undefined} onClick={() => navigate(workspace)}>{label}</button>)}
      </nav>

      <section className={`panel op-controls ${activeWorkspace === "chain" ? "op-controlsActive" : ""} ${filtersOpen ? "op-filtersOpen" : ""}`} aria-label={t("client_027")}>
        <div className={"op-marketTabs"}>
          <button
            type="button"
            className={market === "tsx" ? "op-activeTab" : undefined}
            onClick={() => changeMarket("tsx")}
          >
            {t("client_028")}
          </button>
          <button
            type="button"
            className={market === "commodities" ? "op-activeTab" : undefined}
            onClick={() => changeMarket("commodities")}
          >
            {t("client_029")}
          </button>
        </div>

        <button type="button" className="op-mobileFilterToggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>{t("client_030")}</button>

        <div className={"op-controlGrid"}>
          <form className={"op-symbolForm"} onSubmit={submitSymbol}>
            <label>
              <span>{t("client_031")}</span>
              <div>
                <Search size={17} />
                <input
                  value={draftSymbol}
                  onChange={(event) => setDraftSymbol(event.target.value)}
                  placeholder={market === "tsx" ? "RY, TD, XIU…" : "GC, CL, ZC…"}
                  autoComplete="off"
                />
                <button type="submit">{t("client_032")}</button>
              </div>
            </label>
          </form>

          <button type="button" className="op-favoriteButton" disabled={!symbol} aria-pressed={favorites.includes(symbol)} onClick={toggleFavorite}>
            {favorites.includes(symbol) ? "★" : "☆"}<span className="sr-only">{t("client_033")}</span>
          </button>

          <SelectControl label={t("client_034")} value={category} onChange={setCategory}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? t("client_035") : item}
                </option>
              ))}
          </SelectControl>

          <SelectControl label={t("client_036")}
              value={expiration}
              onChange={(next) => {
                setLoadingChain(true);
                setExpiration(next);
              }}
              disabled={!chain?.expirations.length}
            >
              <option value="">{t("client_037")}</option>
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
            {t("client_038")}
          </button>
        </div>

        {suggestions.length ? <div className="op-symbolResults" aria-label={t("client_039")}>
          {suggestions.map((item) => <button type="button" key={`${item.provider_symbol}-${item.symbol}`} onClick={() => chooseSymbol(item.symbol)}>
            <strong>{item.symbol}</strong><span>{item.name}</span><small>{item.category}</small>
          </button>)}
        </div> : null}
        {(favorites.length || recent.length) ? <div className="op-quickSymbols">
          {favorites.length ? <div><span>{t("client_040")}</span>{favorites.slice(0, 5).map((item) => <button type="button" key={item} onClick={() => chooseSymbol(item)}>{item}</button>)}</div> : null}
          {recent.length ? <div><span>{t("client_041")}</span>{recent.slice(0, 5).map((item) => <button type="button" key={item} onClick={() => chooseSymbol(item)}>{item}</button>)}</div> : null}
        </div> : null}
      </section>

      {[universeError, chainError].map((error, index) => error ? <div className={"op-error"} role="alert" key={index}>{error}</div> : null)}

      <div className="op-workspaceBody" hidden={activeWorkspace !== "chain"}>
      <nav className="op-chainNav" aria-label={t("client_042")}>
        <button type="button" aria-current={chainView === "quotes" ? "page" : undefined} onClick={() => navigate("chain", "quotes")}>{t("client_043")}</button>
        <button type="button" aria-current={chainView === "screener" ? "page" : undefined} onClick={() => navigate("chain", "screener")}>{t("client_044")}</button>
      </nav>
      <div hidden={chainView !== "quotes"}>
      {metrics.some(([, result]) => result != null) ? <section className={"op-metrics"}>
        {metrics.map(([label, result, detail]) => result == null ? null : <article className="panel" key={label}>
          <span>{label}</span><strong>{result}</strong><small>{detail}</small>
        </article>)}
      </section> : null}

      <details className="panel op-dataState">
        <summary>{t("client_045")}</summary>
        <div className={"op-sourcePanel"}>
        <div>
          <p>
            {market === "tsx"
              ? t("client_046")
              : t("client_047")}
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
            <h2>{t("client_048")} · {chain?.symbol ?? symbol}</h2>
            <p>
              {chain?.underlying_price != null
                ? `${t("client_049")}: ${value(chain.underlying_price)}`
                : t("client_050")}
            </p>
            {market === "commodities" && chain?.contracts.length ? <p>
              {t("client_051")}: {new Date(chain.generated_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}
              {chain.stale ? ` · ${t("client_052")}` : ""}
              {` · ${t("client_053")}`}
            </p> : null}
          </div>
          <div className={"op-chainMeta"}>
            <strong>{contracts.length.toLocaleString("fr-CA")}</strong>
            <span>{t("client_054")}</span>
          </div>
        </div>

        {loadingChain && !chain ? (
          <div className={"op-empty"}>
            {t("client_055")}
          </div>
        ) : contracts.length ? (
          <PremiumChain contracts={contracts} underlying={chain?.underlying_price ?? null}
            stale={chain?.stale ?? false} language={language} display={value} onAddStrategy={addStrategyLeg} />
        ) : (
          <div className={"op-empty"}>
            <strong>{t("client_056")}</strong>
            <span>
              {market === "commodities"
                ? t("client_057")
                : t("client_058")}
            </span>
          </div>
        )}
      </section>
      </div>
      {screenerOpened && chain ? <div hidden={chainView !== "screener"}>
        <OptionsScreener chain={chain} language={language} onAddStrategy={addStrategyLeg}
          onTrack={(contract) => { setTrackedContract(contract); navigate("portfolio"); }} />
      </div> : null}
      {chainView === "screener" && !chain ? <div className="panel op-empty">{t("client_059")}</div> : null}
      </div>

      {visited.includes("strategies") ? <div className="op-workspaceBody" hidden={activeWorkspace !== "strategies"}>
        <StrategyBuilder legs={legs} setLegs={setLegs} language={language} onChooseContracts={() => navigate("chain", "quotes")} />
      </div> : null}
      {visited.includes("volatility") ? <div className="op-workspaceBody" hidden={activeWorkspace !== "volatility"}>
        {chain ? <VolatilityIntelligence chain={chain} language={language} active={activeWorkspace === "volatility"} /> : <div className="panel op-empty">{t("client_060")}</div>}
      </div> : null}
      {visited.includes("portfolio") ? <div className="op-workspaceBody" hidden={activeWorkspace !== "portfolio"}>
        <OptionsPortfolio chain={chain} selected={trackedContract} language={language} onAnalyze={analyzeTracked} />
      </div> : null}

      <p className={"op-disclaimer"}>
        {t("client_061")}
      </p>
    </main>
  );
}
