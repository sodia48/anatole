"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Info,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  getInstitutionDetail,
  getInstitutionSecurityActivity,
  getInstitutionsSnapshot,
} from "@/lib/api";
import { localeFor, pick } from "@/lib/i18n";
import type {
  InstitutionDetail,
  InstitutionFlow,
  InstitutionHolding,
  InstitutionHoldingStatus,
  InstitutionSourceStatus,
  InstitutionSummary,
  InstitutionsSnapshot,
} from "@/lib/types";

import styles from "./InstitutionsClient.module.css";

type CountryFilter = "all" | "canada" | "usa" | "other";
type InstitutionSort = "value" | "new" | "increased" | "reduced";
type RadarTab = "increased" | "new" | "reduced" | "closed";
type HoldingSort = "weight" | "value" | "shares" | "percent";
type HoldingFilter = "all" | InstitutionHoldingStatus;

const STATUS_ORDER: InstitutionHoldingStatus[] = [
  "new",
  "increased",
  "reduced",
  "closed",
  "unchanged",
];

function formatMoney(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value)} %`;
}

function formatSigned(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value, locale)}`;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function quarterLabel(value: string | null, language: "fr" | "en"): string {
  if (!value) return "—";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const quarter = Math.ceil(month / 3);
  return `${language === "fr" ? "T" : "Q"}${quarter} ${year}`;
}

function normalizedCountry(country: string): CountryFilter {
  const normalized = country
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized === "canada") return "canada";
  if (normalized.includes("etats-unis") || normalized.includes("united states")) {
    return "usa";
  }
  return "other";
}

function countryLabel(country: string, language: "fr" | "en"): string {
  const normalized = normalizedCountry(country);
  if (normalized === "canada") return "Canada";
  if (normalized === "usa") {
    return language === "fr" ? "États-Unis" : "United States";
  }
  if (country === "Non déterminé" || !country) {
    return language === "fr" ? "Non déterminé" : "Undetermined";
  }
  return country;
}

function statusLabel(status: InstitutionHoldingStatus, language: "fr" | "en"): string {
  const labels: Record<InstitutionHoldingStatus, [string, string]> = {
    new: ["Nouvelle position", "New position"],
    increased: ["Position augmentée", "Increased position"],
    reduced: ["Position réduite", "Reduced position"],
    closed: ["Position fermée", "Closed position"],
    unchanged: ["Position inchangée", "Unchanged position"],
  };
  return pick(language, ...labels[status]);
}

function StatusBadge({
  status,
  language,
}: {
  status: InstitutionHoldingStatus;
  language: "fr" | "en";
}) {
  return (
    <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
      {statusLabel(status, language)}
    </span>
  );
}

function Disclosure({ language }: { language: "fr" | "en" }) {
  return (
    <aside className={styles.disclosure}>
      <Info aria-hidden="true" size={17} />
      <div>
        <strong>
          {pick(language, "Comment lire ces variations", "How to read these changes")}
        </strong>
        <p>
          {pick(
            language,
            "Les variations sont déduites de la comparaison de deux déclarations 13F trimestrielles. Elles ne représentent pas un journal de transactions et peuvent être publiées jusqu’à 45 jours après la fin du trimestre.",
            "Changes are inferred by comparing quarterly 13F filings. They are not a transaction ledger and filings may be published up to 45 days after quarter-end.",
          )}
        </p>
        <details>
          <summary>{pick(language, "Qu’est-ce qu’un 13F ?", "What is a 13F?")}</summary>
          <p>
            {pick(
              language,
              "Déclaration trimestrielle déposée auprès de la SEC par certains grands gestionnaires institutionnels. Elle présente leurs positions sur les titres visés par la réglementation 13F à la fin du trimestre. Elle ne constitue pas un journal de transactions ni nécessairement le portefeuille complet.",
              "A quarterly filing submitted to the SEC by certain large institutional investment managers. It reports their positions in securities covered by 13F rules at quarter-end. It is not a transaction ledger and does not necessarily represent the manager’s complete portfolio.",
            )}
          </p>
        </details>
      </div>
    </aside>
  );
}

function SourcePanel({
  sources,
  generatedAt,
  language,
}: {
  sources: InstitutionSourceStatus[];
  generatedAt: string;
  language: "fr" | "en";
}) {
  const locale = localeFor(language);
  return (
    <section className={styles.sources} aria-label={pick(language, "Sources", "Sources")}>
      <div>
        <span className={styles.eyebrow}>{pick(language, "SOURCES OFFICIELLES", "OFFICIAL SOURCES")}</span>
        <h2>SEC EDGAR — Form 13F-HR</h2>
        <p>
          {pick(language, "Instantané généré le", "Snapshot generated on")} {formatDate(generatedAt, locale)}
        </p>
      </div>
      <div className={styles.sourceList}>
        {sources.map((source) => (
          <a key={`${source.source}-${source.url}`} href={source.url} target="_blank" rel="noreferrer">
            <span className={`${styles.sourceStatus} ${styles[`source_${source.status}`]}`}>
              {source.status.toUpperCase()}
            </span>
            <span>{source.source}</span>
            <ExternalLink aria-hidden="true" size={14} />
          </a>
        ))}
      </div>
    </section>
  );
}

function InstitutionRows({
  institutions,
  locale,
  language,
}: {
  institutions: InstitutionSummary[];
  locale: string;
  language: "fr" | "en";
}) {
  return (
    <>
      <div className={styles.desktopTable}>
        <table>
          <thead>
            <tr>
              <th>{pick(language, "Institution", "Institution")}</th>
              <th>{pick(language, "Valeur 13F", "13F value")}</th>
              <th>{pick(language, "Positions", "Holdings")}</th>
              <th>{pick(language, "Nouvelles", "New")}</th>
              <th>{pick(language, "Augmentées", "Increased")}</th>
              <th>{pick(language, "Réduites", "Reduced")}</th>
              <th>{pick(language, "Fermées", "Closed")}</th>
              <th>{pick(language, "Dernier rapport", "Latest report")}</th>
            </tr>
          </thead>
          <tbody>
            {institutions.map((institution) => (
              <tr key={institution.cik}>
                <td>
                  <Link className={styles.institutionLink} href={`/institutions/${institution.cik}`}>
                    <Building2 aria-hidden="true" size={16} />
                    <span>
                      <strong>{institution.name}</strong>
                      <small>CIK {institution.cik} · {countryLabel(institution.country, language)}</small>
                    </span>
                  </Link>
                </td>
                <td><strong>{formatMoney(institution.total_13f_value, locale)}</strong></td>
                <td>{formatNumber(institution.holdings_count, locale)}</td>
                <td className={styles.positive}>{formatNumber(institution.new_positions_count, locale)}</td>
                <td className={styles.positive}>{formatNumber(institution.increased_positions_count, locale)}</td>
                <td className={styles.negative}>{formatNumber(institution.reduced_positions_count, locale)}</td>
                <td className={styles.negative}>{formatNumber(institution.closed_positions_count, locale)}</td>
                <td>{formatDate(institution.report_period, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.mobileCards}>
        {institutions.map((institution) => (
          <Link className={styles.institutionCard} href={`/institutions/${institution.cik}`} key={institution.cik}>
            <div className={styles.cardHeading}>
              <div>
                <strong>{institution.name}</strong>
                <span>CIK {institution.cik} · {countryLabel(institution.country, language)}</span>
              </div>
              <ArrowUpRight aria-hidden="true" size={18} />
            </div>
            <div className={styles.cardValue}>
              <span>{pick(language, "Valeur des positions 13F", "13F holdings value")}</span>
              <strong>{formatMoney(institution.total_13f_value, locale)}</strong>
            </div>
            <dl className={styles.cardStats}>
              <div><dt>{pick(language, "Positions", "Holdings")}</dt><dd>{formatNumber(institution.holdings_count, locale)}</dd></div>
              <div><dt>{pick(language, "Nouvelles", "New")}</dt><dd>{formatNumber(institution.new_positions_count, locale)}</dd></div>
              <div><dt>{pick(language, "Augmentées", "Increased")}</dt><dd>{formatNumber(institution.increased_positions_count, locale)}</dd></div>
              <div><dt>{pick(language, "Réduites", "Reduced")}</dt><dd>{formatNumber(institution.reduced_positions_count, locale)}</dd></div>
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}

function Radar({
  snapshot,
  language,
  locale,
}: {
  snapshot: InstitutionsSnapshot;
  language: "fr" | "en";
  locale: string;
}) {
  const [tab, setTab] = useState<RadarTab>("increased");
  const flows: Record<RadarTab, InstitutionFlow[]> = {
    increased: snapshot.top_increased,
    new: snapshot.top_new,
    reduced: snapshot.top_reduced,
    closed: snapshot.top_closed,
  };
  const tabLabels: Record<RadarTab, [string, string]> = {
    increased: ["Plus accumulés", "Most accumulated"],
    new: ["Nouvelles positions", "New positions"],
    reduced: ["Plus réduits", "Most reduced"],
    closed: ["Plus fermés", "Most closed"],
  };

  return (
    <aside className={styles.radar}>
      <span className={styles.eyebrow}>{pick(language, "RADAR GLOBAL", "GLOBAL RADAR")}</span>
      <h2>{pick(language, "Titres les plus accumulés", "Most accumulated securities")}</h2>
      <div className={styles.tabList} role="tablist" aria-label={pick(language, "Catégorie du radar", "Radar category")}>
        {(Object.keys(tabLabels) as RadarTab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {pick(language, ...tabLabels[key])}
          </button>
        ))}
      </div>
      <ol className={styles.flowList}>
        {flows[tab].slice(0, 10).map((flow) => (
          <li key={`${flow.cusip}-${flow.ticker ?? "unknown"}`}>
            <span className={styles.flowRank}>{String(flows[tab].indexOf(flow) + 1).padStart(2, "0")}</span>
            <div>
              <strong>{flow.ticker ?? flow.issuer}</strong>
              <span>{flow.ticker ? flow.issuer : `CUSIP ${flow.cusip}`}</span>
            </div>
            <div className={styles.flowNumbers}>
              <strong>{tab === "new" ? flow.institutions_new : tab === "reduced" ? flow.institutions_reduced : tab === "closed" ? flow.institutions_closed : flow.institutions_increased}</strong>
              <span>{pick(language, "institutions", "institutions")}</span>
              {flow.aggregate_share_change !== null && (
                <small>{formatSigned(flow.aggregate_share_change, locale)} {pick(language, "actions déclarées", "reported shares")}</small>
              )}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function ActivitySearch({ language, locale }: { language: "fr" | "en"; locale: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<InstitutionFlow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await getInstitutionSecurityActivity(query));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : pick(language, "Recherche indisponible.", "Search unavailable."));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.activity}>
      <div>
        <span className={styles.eyebrow}>{pick(language, "RECHERCHE PAR TITRE", "SECURITY LOOKUP")}</span>
        <h2>{pick(language, "Voir qui détient un titre", "See who holds a security")}</h2>
        <p>{pick(language, "Recherche fiable par ticker résolu ou CUSIP officiel.", "Reliable search by resolved ticker or official CUSIP.")}</p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="institution-security-search">{pick(language, "Ticker ou CUSIP", "Ticker or CUSIP")}</label>
        <div>
          <Search aria-hidden="true" size={17} />
          <input id="institution-security-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="NVDA, AAPL, RY…" />
          <button type="submit" disabled={loading || !query.trim()}>{loading ? pick(language, "Analyse…", "Analyzing…") : pick(language, "Rechercher", "Search")}</button>
        </div>
      </form>
      {error && <p className={styles.inlineError}>{error}</p>}
      {result && (
        result.institution_names.length === 0 ? (
          <p className={styles.emptyInline}>{pick(language, "Aucune position correspondante dans l’univers institutionnel suivi.", "No matching holding in the tracked institutional universe.")}</p>
        ) : (
          <div className={styles.activityResult}>
            <div className={styles.activityTitle}>
              <div><strong>{result.ticker ?? result.issuer}</strong><span>{result.issuer || `CUSIP ${result.cusip}`}</span></div>
              {result.ticker && <Link href={`/focus/${encodeURIComponent(result.ticker)}`}>{pick(language, "Ouvrir Focus", "Open Focus")} <ArrowUpRight aria-hidden="true" size={14} /></Link>}
            </div>
            <dl>
              <div><dt>{pick(language, "Institutions détenant", "Institutions holding")}</dt><dd>{result.institutions_holding}</dd></div>
              <div><dt>{pick(language, "Ayant augmenté", "Increased")}</dt><dd>{result.institutions_increased}</dd></div>
              <div><dt>{pick(language, "Ayant réduit", "Reduced")}</dt><dd>{result.institutions_reduced}</dd></div>
              <div><dt>{pick(language, "Nouvelles positions", "New positions")}</dt><dd>{result.institutions_new}</dd></div>
              <div><dt>{pick(language, "Positions fermées", "Closed positions")}</dt><dd>{result.institutions_closed}</dd></div>
              <div><dt>{pick(language, "Valeur déclarée", "Reported value")}</dt><dd>{formatMoney(result.current_reported_value, locale)}</dd></div>
            </dl>
            <p><strong>{pick(language, "Principaux déclarants :", "Top filers:")}</strong> {result.institution_names.join(" · ")}</p>
          </div>
        )
      )}
    </section>
  );
}

export function InstitutionsClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const locale = localeFor(language);
  const [snapshot, setSnapshot] = useState<InstitutionsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<CountryFilter>("all");
  const [sort, setSort] = useState<InstitutionSort>("value");

  const load = useCallback(async (refresh = false, signal?: AbortSignal) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await getInstitutionsSnapshot(50, refresh, signal);
      setSnapshot(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : pick(language, "Les données institutionnelles sont temporairement indisponibles.", "Institutional data is temporarily unavailable."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(false, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const institutions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sortValue: Record<InstitutionSort, keyof InstitutionSummary> = {
      value: "total_13f_value",
      new: "new_positions_count",
      increased: "increased_positions_count",
      reduced: "reduced_positions_count",
    };
    return [...(snapshot?.institutions ?? [])]
      .filter((institution) => !needle || institution.name.toLowerCase().includes(needle) || institution.cik.includes(needle))
      .filter((institution) => country === "all" || normalizedCountry(institution.country) === country)
      .sort((left, right) => Number(right[sortValue[sort]]) - Number(left[sortValue[sort]]));
  }, [country, query, snapshot?.institutions, sort]);

  const totalValue = snapshot?.institutions.reduce((sum, institution) => sum + institution.total_13f_value, 0) ?? 0;
  const totalNew = snapshot?.institutions.reduce((sum, institution) => sum + institution.new_positions_count, 0) ?? 0;
  const totalIncreased = snapshot?.institutions.reduce((sum, institution) => sum + institution.increased_positions_count, 0) ?? 0;
  const totalReduced = snapshot?.institutions.reduce((sum, institution) => sum + institution.reduced_positions_count, 0) ?? 0;

  if (loading && snapshot === null) {
    return <main className={styles.page}><section className={styles.loading}><span className={styles.spinner} /><div><h1>{pick(language, "Chargement des institutions…", "Loading institutions…")}</h1><p>SEC EDGAR — Form 13F</p></div></section></main>;
  }

  if (snapshot === null) {
    return <main className={styles.page}><section className={styles.failure}><Building2 aria-hidden="true" size={34} /><h1>{pick(language, "Données temporairement indisponibles", "Data temporarily unavailable")}</h1><p>{error ?? pick(language, "Les données institutionnelles sont temporairement indisponibles.", "Institutional data is temporarily unavailable.")}</p><button type="button" onClick={() => void load()}>{pick(language, "Réessayer", "Try again")}</button></section></main>;
  }

  return (
    <main className={styles.page}>
      {(snapshot.stale || error) && <div className={styles.staleBanner}><strong>STALE</strong><span>{snapshot.message ?? error ?? pick(language, "Dernier instantané fiable affiché.", "Last reliable snapshot shown.")}</span></div>}
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>INSTITUTIONS</span><h1>{pick(language, "Suivre les grands gestionnaires à travers leurs déclarations 13F.", "Track major institutional managers through their 13F filings.")}</h1><p>{pick(language, "Données officielles SEC, comparées entre deux trimestres.", "Official SEC data compared across two quarters.")}</p></div>
        <div className={styles.heroAside}><strong>{snapshot.institutions.length}</strong><span>{pick(language, "institutions suivies", "tracked institutions")}</span><small>{pick(language, "Dernier trimestre", "Latest quarter")} · {quarterLabel(snapshot.report_period, language)}</small></div>
      </section>
      <section className={styles.metrics} aria-label={pick(language, "Indicateurs", "Metrics")}>
        <div><span>{pick(language, "Valeur 13F suivie", "Tracked 13F value")}</span><strong>{formatMoney(totalValue, locale)}</strong></div>
        <div><span>{pick(language, "Nouvelles positions", "New positions")}</span><strong>{formatNumber(totalNew, locale)}</strong></div>
        <div><span>{pick(language, "Positions augmentées", "Increased positions")}</span><strong>{formatNumber(totalIncreased, locale)}</strong></div>
        <div><span>{pick(language, "Positions réduites", "Reduced positions")}</span><strong>{formatNumber(totalReduced, locale)}</strong></div>
      </section>
      <Disclosure language={language} />
      <ActivitySearch language={language} locale={locale} />
      <section className={styles.directoryGrid}>
        <div className={styles.directory}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>{pick(language, "CLASSEMENT", "RANKING")}</span><h2>{pick(language, "Principaux gestionnaires 13F", "Leading 13F managers")}</h2></div>
            <button className={styles.refreshButton} type="button" onClick={() => void load(true)} disabled={refreshing}><RefreshCw aria-hidden="true" size={15} className={refreshing ? styles.spinning : undefined} />{pick(language, "Actualiser", "Refresh")}</button>
          </div>
          <div className={styles.filters}>
            <label className={styles.searchBox}><Search aria-hidden="true" size={17} /><span className={styles.srOnly}>{pick(language, "Rechercher une institution", "Search an institution")}</span><input aria-label={pick(language, "Rechercher une institution", "Search an institution")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick(language, "Nom ou CIK", "Name or CIK")} /></label>
            <label><span>{pick(language, "Pays", "Country")}</span><select value={country} onChange={(event) => setCountry(event.target.value as CountryFilter)}><option value="all">{pick(language, "Toutes", "All")}</option><option value="canada">Canada</option><option value="usa">{pick(language, "États-Unis", "United States")}</option><option value="other">{pick(language, "Autres", "Other")}</option></select></label>
            <label><span>{pick(language, "Trier par", "Sort by")}</span><select aria-label={pick(language, "Trier les institutions", "Sort institutions")} value={sort} onChange={(event) => setSort(event.target.value as InstitutionSort)}><option value="value">{pick(language, "Valeur", "Value")}</option><option value="new">{pick(language, "Nouvelles", "New")}</option><option value="increased">{pick(language, "Augmentées", "Increased")}</option><option value="reduced">{pick(language, "Réduites", "Reduced")}</option></select></label>
          </div>
          {institutions.length > 0 ? <InstitutionRows institutions={institutions} locale={locale} language={language} /> : <p className={styles.emptyInline}>{pick(language, "Aucune institution ne correspond à ces filtres.", "No institution matches these filters.")}</p>}
        </div>
        <Radar snapshot={snapshot} language={language} locale={locale} />
      </section>
      <SourcePanel sources={snapshot.sources} generatedAt={snapshot.generated_at} language={language} />
    </main>
  );
}

function HoldingCards({ holdings, language, locale }: { holdings: InstitutionHolding[]; language: "fr" | "en"; locale: string }) {
  return <div className={styles.holdingCards}>{holdings.map((holding) => <article key={`${holding.cusip}-${holding.put_call ?? "shares"}`}><div className={styles.cardHeading}><div><strong>{holding.ticker ?? holding.issuer}</strong><span>{holding.ticker ? holding.issuer : `CUSIP ${holding.cusip}`}</span></div><StatusBadge status={holding.status} language={language} /></div>{holding.put_call && <span className={styles.optionBadge}>{holding.put_call}</span>}<dl className={styles.cardStats}><div><dt>{pick(language, "Actions déclarées", "Reported shares")}</dt><dd>{formatNumber(holding.shares, locale)}</dd></div><div><dt>{pick(language, "Variation actions", "Share change")}</dt><dd>{formatSigned(holding.share_change, locale)}</dd></div><div><dt>{pick(language, "Valeur déclarée", "Reported value")}</dt><dd>{formatMoney(holding.value, locale)}</dd></div><div><dt>{pick(language, "Poids", "Weight")}</dt><dd>{formatPercent(holding.portfolio_weight_percent, locale)}</dd></div></dl></article>)}</div>;
}

export function InstitutionDetailClient() {
  const params = useParams<{ cik: string }>();
  const cik = decodeURIComponent(params.cik ?? "");
  const { preferences } = usePreferences();
  const language = preferences.language;
  const locale = localeFor(language);
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HoldingFilter>("all");
  const [sort, setSort] = useState<HoldingSort>("weight");

  const load = useCallback(async (refresh = false, signal?: AbortSignal) => {
    if (!cik) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      setDetail(await getInstitutionDetail(cik, refresh, signal));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : pick(language, "Les données institutionnelles sont temporairement indisponibles.", "Institutional data is temporarily unavailable."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cik, language]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(false, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const holdings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(detail?.holdings ?? [])]
      .filter((holding) => filter === "all" || holding.status === filter)
      .filter((holding) => !needle || holding.issuer.toLowerCase().includes(needle) || holding.cusip.toLowerCase().includes(needle) || holding.ticker?.toLowerCase().includes(needle))
      .sort((left, right) => {
        if (sort === "weight") return right.portfolio_weight_percent - left.portfolio_weight_percent;
        if (sort === "value") return right.value - left.value;
        if (sort === "shares") return Math.abs(right.share_change) - Math.abs(left.share_change);
        return Math.abs(right.share_change_percent ?? 0) - Math.abs(left.share_change_percent ?? 0);
      });
  }, [detail?.holdings, filter, query, sort]);

  if (loading && detail === null) return <main className={styles.page}><section className={styles.loading}><span className={styles.spinner} /><div><h1>{pick(language, "Chargement des positions 13F…", "Loading 13F holdings…")}</h1><p>SEC EDGAR</p></div></section></main>;
  if (detail === null) return <main className={styles.page}><section className={styles.failure}><Building2 aria-hidden="true" size={34} /><h1>{pick(language, "Données temporairement indisponibles", "Data temporarily unavailable")}</h1><p>{error}</p><Link href="/institutions">{pick(language, "Retour aux institutions", "Back to institutions")}</Link></section></main>;

  const institution = detail.institution;
  const metrics: Array<[string, string]> = [
    [pick(language, "Valeur des positions 13F", "13F holdings value"), formatMoney(institution.total_13f_value, locale)],
    [pick(language, "Nombre de positions", "Number of holdings"), formatNumber(institution.holdings_count, locale)],
    [pick(language, "Concentration Top 10", "Top 10 concentration"), formatPercent(institution.top10_concentration_percent, locale)],
    [pick(language, "Nouvelles positions", "New positions"), formatNumber(institution.new_positions_count, locale)],
    [pick(language, "Positions augmentées", "Increased positions"), formatNumber(institution.increased_positions_count, locale)],
    [pick(language, "Positions réduites", "Reduced positions"), formatNumber(institution.reduced_positions_count, locale)],
    [pick(language, "Positions fermées", "Closed positions"), formatNumber(institution.closed_positions_count, locale)],
  ];

  return (
    <main className={styles.page}>
      {(detail.stale || error) && <div className={styles.staleBanner}><strong>STALE</strong><span>{detail.message ?? error ?? pick(language, "Dernier instantané fiable affiché.", "Last reliable snapshot shown.")}</span></div>}
      <Link className={styles.backLink} href="/institutions"><ArrowLeft aria-hidden="true" size={16} />{pick(language, "Toutes les institutions", "All institutions")}</Link>
      <section className={`${styles.hero} ${styles.detailHero}`}>
        <div><span className={styles.eyebrow}>{countryLabel(institution.country, language)} · FORM 13F</span><h1>{institution.name}</h1><p>CIK {institution.cik} · {pick(language, "Rapport", "Report")}: {formatDate(institution.report_period, locale)} · {pick(language, "Déposé", "Filed")}: {formatDate(institution.filed_at, locale)}</p><a className={styles.secLink} href={institution.filing_url} target="_blank" rel="noreferrer">SEC EDGAR — Form 13F-HR <ExternalLink aria-hidden="true" size={14} /></a></div>
        <button className={styles.refreshButton} type="button" onClick={() => void load(true)} disabled={refreshing}><RefreshCw aria-hidden="true" size={15} className={refreshing ? styles.spinning : undefined} />{pick(language, "Actualiser", "Refresh")}</button>
      </section>
      <section className={`${styles.metrics} ${styles.detailMetrics}`}>{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
      {!institution.comparison_available && <div className={styles.staleBanner}><strong>{pick(language, "COMPARAISON INDISPONIBLE", "COMPARISON UNAVAILABLE")}</strong><span>{pick(language, "Aucun trimestre précédent officiel exploitable n’a été trouvé; aucune variation n’est inventée.", "No usable official previous quarter was found; no changes are fabricated.")}</span></div>}
      {normalizedCountry(institution.country) === "canada" && <aside className={styles.canadaNote}>{pick(language, "Le Form 13F couvre les titres visés par la réglementation américaine 13F et ne représente pas nécessairement l’ensemble du portefeuille canadien ou mondial du gestionnaire.", "Form 13F covers securities subject to U.S. 13F rules and does not necessarily represent the manager’s entire Canadian or global portfolio.")}</aside>}
      <Disclosure language={language} />
      <section className={styles.holdingsPanel}>
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>{pick(language, "POSITIONS DÉCLARÉES", "REPORTED HOLDINGS")}</span><h2>{pick(language, "Comparaison trimestrielle", "Quarterly comparison")}</h2><p>{formatDate(detail.previous_report_period, locale)} → {formatDate(institution.report_period, locale)}</p></div><strong>{formatNumber(holdings.length, locale)}</strong></div>
        <div className={styles.holdingTabs} role="tablist" aria-label={pick(language, "Statut des positions", "Holding status")}>{(["all", ...STATUS_ORDER.slice(0, 4)] as HoldingFilter[]).map((status) => <button key={status} type="button" role="tab" aria-selected={filter === status} onClick={() => setFilter(status)}>{status === "all" ? pick(language, "Toutes", "All") : statusLabel(status, language)}</button>)}</div>
        <div className={styles.filters}>
          <label className={styles.searchBox}><Search aria-hidden="true" size={17} /><span className={styles.srOnly}>{pick(language, "Rechercher une position", "Search a holding")}</span><input aria-label={pick(language, "Rechercher une position", "Search a holding")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick(language, "Ticker, émetteur ou CUSIP", "Ticker, issuer or CUSIP")} /></label>
          <label><span>{pick(language, "Trier par", "Sort by")}</span><select value={sort} onChange={(event) => setSort(event.target.value as HoldingSort)}><option value="weight">{pick(language, "Poids", "Weight")}</option><option value="value">{pick(language, "Valeur", "Value")}</option><option value="shares">∆ {pick(language, "actions", "shares")}</option><option value="percent">∆ %</option></select></label>
        </div>
        {holdings.length > 0 ? <><div className={styles.desktopTable}><table><thead><tr><th>Ticker</th><th>{pick(language, "Émetteur", "Issuer")}</th><th>{pick(language, "Actions déclarées", "Reported shares")}</th><th>{pick(language, "Variation actions", "Share change")}</th><th>{pick(language, "Variation %", "Change %")}</th><th>{pick(language, "Valeur déclarée", "Reported value")}</th><th>{pick(language, "Poids portefeuille", "Portfolio weight")}</th><th>{pick(language, "Statut", "Status")}</th></tr></thead><tbody>{holdings.map((holding) => <tr key={`${holding.cusip}-${holding.put_call ?? "shares"}`}><td><strong>{holding.ticker ?? "—"}</strong>{holding.put_call && <span className={styles.optionBadge}>{holding.put_call}</span>}<small>CUSIP {holding.cusip}</small></td><td>{holding.issuer}<small>{holding.security_class}</small></td><td>{formatNumber(holding.shares, locale)}</td><td className={holding.share_change >= 0 ? styles.positive : styles.negative}>{formatSigned(holding.share_change, locale)}</td><td className={(holding.share_change_percent ?? 0) >= 0 ? styles.positive : styles.negative}>{formatPercent(holding.share_change_percent, locale)}</td><td>{formatMoney(holding.value, locale)}</td><td>{formatPercent(holding.portfolio_weight_percent, locale)}</td><td><StatusBadge status={holding.status} language={language} /></td></tr>)}</tbody></table></div><HoldingCards holdings={holdings} language={language} locale={locale} /></> : <p className={styles.emptyInline}>{pick(language, "Aucune position ne correspond à ces filtres.", "No holding matches these filters.")}</p>}
      </section>
      <SourcePanel sources={detail.source_statuses} generatedAt={detail.generated_at} language={language} />
    </main>
  );
}
