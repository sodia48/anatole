"use client";

import { Activity, RefreshCw, Search } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
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

import styles from "./options.module.css";

type SideFilter = "both" | "call" | "put";

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
    <div className={styles.status}>
      <span className={`${styles.dot} ${styles[item.status]}`} />
      <div>
        <strong>{item.source}</strong>
        <small>{item.detail ?? item.status}</small>
      </div>
    </div>
  );
}

function ContractRow({
  item,
  language,
}: {
  item: OptionContract;
  language: "fr" | "en";
}) {
  return (
    <tr className={item.in_the_money ? styles.inMoney : undefined}>
      <td>{item.expiration}</td>
      <td>
        <span className={item.side === "call" ? styles.callBadge : styles.putBadge}>
          {item.side === "call"
            ? pick(language, "CALL", "CALL")
            : pick(language, "PUT", "PUT")}
        </span>
      </td>
      <td>{value(item.strike)}</td>
      <td>{value(item.bid)}</td>
      <td>{value(item.ask)}</td>
      <td>{value(item.last)}</td>
      <td className={(item.change ?? 0) >= 0 ? styles.positive : styles.negative}>
        {value(item.change)}
      </td>
      <td>{integer(item.volume)}</td>
      <td>{integer(item.open_interest)}</td>
      <td>{item.implied_volatility == null ? "N/D" : `${value(item.implied_volatility, 1)} %`}</td>
      <td>{value(item.delta, 3)}</td>
      <td>{value(item.gamma, 4)}</td>
      <td>{value(item.theta, 3)}</td>
      <td>{value(item.vega, 3)}</td>
    </tr>
  );
}

export function OptionsClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [market, setMarket] = useState<OptionMarket>("tsx");
  const [universe, setUniverse] = useState<OptionUniverseSnapshot | null>(null);
  const [chain, setChain] = useState<OptionChainSnapshot | null>(null);
  const [symbol, setSymbol] = useState("RY");
  const [draftSymbol, setDraftSymbol] = useState("RY");
  const [expiration, setExpiration] = useState("");
  const [side, setSide] = useState<SideFilter>("both");
  const [category, setCategory] = useState("all");
  const [loadingUniverse, setLoadingUniverse] = useState(true);
  const [loadingChain, setLoadingChain] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getOptionsUniverse(market, controller.signal)
      .then((snapshot) => {
        setUniverse(snapshot);
        setError(null);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") {
          setError(
            reason instanceof Error
              ? reason.message
              : pick(language, "Univers d'options indisponible.", "Options universe unavailable."),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingUniverse(false);
      });
    return () => controller.abort();
  }, [language, market, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    void getOptionChain(
      market,
      symbol,
      expiration || undefined,
      controller.signal,
    )
      .then((snapshot) => {
        setChain(snapshot);
        setError(null);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") {
          setError(
            reason instanceof Error
              ? reason.message
              : pick(language, "Cha?ne d'options indisponible.", "Options chain unavailable."),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingChain(false);
      });
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
    () => [
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
      setError(pick(language, "Symbole invalide.", "Invalid symbol."));
      return;
    }
    setLoadingChain(true);
    setExpiration("");
    setSymbol(next);
  }

  function chooseSymbol(next: string) {
    setLoadingChain(true);
    setDraftSymbol(next);
    setSymbol(next);
    setExpiration("");
  }

  const analytics = chain?.analytics;

  return (
    <main className={styles.page}>
      <header className={`panel ${styles.hero}`}>
        <div>
          <span className="eyebrow">
            {pick(language, "D?RIV?S ? OPTIONS", "DERIVATIVES ? OPTIONS")}
          </span>
          <h1>{pick(language, "Options", "Options")}</h1>
          <p>
            {pick(
              language,
              "Calls, puts, ?ch?ances, volumes, int?r?t ouvert et m?triques de cha?ne pour les classes canadiennes et les options sur contrats ? terme de mati?res premi?res.",
              "Calls, puts, expiries, volume, open interest and chain metrics for Canadian listed classes and commodity futures options.",
            )}
          </p>
        </div>
        <div className={styles.heroBadge}>
          <Activity size={18} />
          <span>{market === "tsx" ? "MX / TSX" : "Futures options"}</span>
        </div>
      </header>

      <section className={`panel ${styles.controls}`}>
        <div className={styles.marketTabs}>
          <button
            type="button"
            className={market === "tsx" ? styles.activeTab : undefined}
            onClick={() => changeMarket("tsx")}
          >
            {pick(language, "Canada ? Montr?al", "Canada ? Montr?al")}
          </button>
          <button
            type="button"
            className={market === "commodities" ? styles.activeTab : undefined}
            onClick={() => changeMarket("commodities")}
          >
            {pick(language, "Mati?res premi?res", "Commodities")}
          </button>
        </div>

        <div className={styles.controlGrid}>
          <form className={styles.symbolForm} onSubmit={submitSymbol}>
            <label>
              <span>{pick(language, "Sous-jacent / racine", "Underlying / root")}</span>
              <div>
                <Search size={17} />
                <input
                  value={draftSymbol}
                  onChange={(event) => setDraftSymbol(event.target.value)}
                  placeholder={market === "tsx" ? "RY, TD, XIU?" : "GC, CL, ZC?"}
                />
                <button type="submit">{pick(language, "Charger", "Load")}</button>
              </div>
            </label>
          </form>

          <label className={styles.selectControl}>
            <span>{pick(language, "Cat?gorie", "Category")}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? pick(language, "Toutes", "All") : item}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.selectControl}>
            <span>{pick(language, "?ch?ance", "Expiry")}</span>
            <select
              value={expiration}
              onChange={(event) => {
                setLoadingChain(true);
                setExpiration(event.target.value);
              }}
              disabled={!chain?.expirations.length}
            >
              <option value="">{pick(language, "Toutes / plus proche", "All / nearest")}</option>
              {chain?.expirations.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className={styles.selectControl}>
            <span>{pick(language, "Type", "Type")}</span>
            <select value={side} onChange={(event) => setSide(event.target.value as SideFilter)}>
              <option value="both">Call + Put</option>
              <option value="call">Calls</option>
              <option value="put">Puts</option>
            </select>
          </label>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => {
              setLoadingUniverse(true);
              setLoadingChain(true);
              setRefreshKey((current) => current + 1);
            }}
            disabled={loadingUniverse || loadingChain}
          >
            <RefreshCw className={loadingUniverse || loadingChain ? styles.spin : undefined} size={17} />
            {pick(language, "Actualiser", "Refresh")}
          </button>
        </div>

        <div className={styles.shortcuts}>
          {loadingUniverse ? (
            <span>{pick(language, "Chargement de l'univers?", "Loading universe?")}</span>
          ) : (
            universeItems.slice(0, 80).map((item) => (
              <button
                type="button"
                key={`${item.provider_symbol}-${item.symbol}`}
                className={symbol === item.symbol ? styles.selectedShortcut : undefined}
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

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.metrics}>
        <article className="panel">
          <span>{pick(language, "Contrats", "Contracts")}</span>
          <strong>{analytics ? integer(analytics.contract_count) : "?"}</strong>
          <small>{chain ? `${chain.name} ? ${chain.exchange}` : symbol}</small>
        </article>
        <article className="panel">
          <span>Put / Call ? {pick(language, "volume", "volume")}</span>
          <strong>{ratio(analytics?.put_call_volume_ratio)}</strong>
          <small>
            {analytics
              ? `${integer(analytics.put_volume)} P / ${integer(analytics.call_volume)} C`
              : "?"}
          </small>
        </article>
        <article className="panel">
          <span>Put / Call ? OI</span>
          <strong>{ratio(analytics?.put_call_open_interest_ratio)}</strong>
          <small>
            {analytics
              ? `${integer(analytics.put_open_interest)} P / ${integer(analytics.call_open_interest)} C`
              : "?"}
          </small>
        </article>
        <article className="panel">
          <span>{pick(language, "Volatilit? implicite ATM", "ATM implied volatility")}</span>
          <strong>
            {analytics?.atm_implied_volatility == null
              ? "N/D"
              : `${value(analytics.atm_implied_volatility, 1)} %`}
          </strong>
          <small>{pick(language, "Selon les champs fournis par la source", "When supplied by the provider")}</small>
        </article>
        <article className="panel">
          <span>{pick(language, "Max pain estim?", "Estimated max pain")}</span>
          <strong>{value(analytics?.max_pain_estimate)}</strong>
          <small>{pick(language, "Calcul descriptif ? partir de l'OI", "Descriptive calculation from OI")}</small>
        </article>
      </section>

      <section className={`panel ${styles.sourcePanel}`}>
        <div>
          <h2>{pick(language, "Couverture et sources", "Coverage and sources")}</h2>
          <p>
            {market === "tsx"
              ? pick(
                  language,
                  "La Bourse de Montr?al est la source officielle prioritaire. Barchart puis Yahoo ne servent que de replis lorsque n?cessaire.",
                  "Montr?al Exchange is the primary official source. Barchart and then Yahoo are only fallbacks when needed.",
                )
              : pick(
                  language,
                  "Les cha?nes de mati?res premi?res utilisent Barchart OnDemand. Toute racine de futures support?e peut ?tre saisie, m?me si elle n'est pas dans les raccourcis.",
                  "Commodity chains use Barchart OnDemand. Any supported futures root can be entered even when it is not shown as a shortcut.",
                )}
          </p>
        </div>
        <div className={styles.statuses}>
          {statuses.map((item, index) => (
            <Status item={item} key={`${item.source}-${item.status}-${index}`} />
          ))}
        </div>
      </section>

      <section className={`panel ${styles.chainPanel}`}>
        <div className={styles.chainHeader}>
          <div>
            <span className="eyebrow">{market === "tsx" ? "MX" : "COMMODITIES"}</span>
            <h2>{chain ? `${chain.symbol} ? ${chain.name}` : symbol}</h2>
            <p>
              {chain?.underlying_price != null
                ? `${pick(language, "Sous-jacent", "Underlying")}: ${value(chain.underlying_price)}`
                : pick(language, "Prix du sous-jacent non fourni par cette source.", "Underlying price not supplied by this source.")}
            </p>
          </div>
          <div className={styles.chainMeta}>
            <strong>{contracts.length.toLocaleString("fr-CA")}</strong>
            <span>{pick(language, "lignes affich?es", "rows shown")}</span>
          </div>
        </div>

        {loadingChain && !chain ? (
          <div className={styles.empty}>
            {pick(language, "Chargement de la cha?ne?", "Loading option chain?")}
          </div>
        ) : contracts.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{pick(language, "?ch?ance", "Expiry")}</th>
                  <th>Type</th>
                  <th>Strike</th>
                  <th>Bid</th>
                  <th>Ask</th>
                  <th>Last</th>
                  <th>? prix</th>
                  <th>Vol.</th>
                  <th>OI</th>
                  <th>IV</th>
                  <th>Delta</th>
                  <th>Gamma</th>
                  <th>Theta</th>
                  <th>Vega</th>
                </tr>
              </thead>
              <tbody>
                {contracts.slice(0, 1200).map((item) => (
                  <ContractRow item={item} key={`${item.symbol}-${item.side}-${item.strike}-${item.expiration}`} language={language} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <strong>{pick(language, "Aucune cha?ne exploitable pour l'instant.", "No usable chain yet.")}</strong>
            <span>
              {market === "commodities"
                ? pick(
                    language,
                    "Pour les mati?res premi?res, configure BARCHART_API_KEY dans Render avec les permissions de march? n?cessaires. Anatole n'invente jamais une cha?ne quand le fournisseur est absent.",
                    "For commodities, configure BARCHART_API_KEY in Render with the required market permissions. Anatole never fabricates a chain when the provider is unavailable.",
                  )
                : pick(
                    language,
                    "La classe peut ?tre admissible sur MX sans que le fournisseur de repli dispose de la cha?ne ? cet instant.",
                    "A class may be listed on MX even when a fallback provider has no chain at that moment.",
                  )}
            </span>
          </div>
        )}
      </section>

      <p className={styles.disclaimer}>
        {pick(
          language,
          "Donn?es descriptives seulement. Les options comportent un risque important; les cotes peuvent ?tre diff?r?es ou partielles selon la source et les permissions.",
          "Descriptive data only. Options involve substantial risk; quotes may be delayed or partial depending on source and permissions.",
        )}
      </p>
    </main>
  );
}