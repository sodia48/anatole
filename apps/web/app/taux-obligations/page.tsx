import type { ReactNode } from "react";
import type { BondIssue, CanadaCurve, CurveHistory, DataQuality, MunicipalityProfile, ProvinceProfile } from "@/lib/fixed-income";
import styles from "@/components/fixed-income/FixedIncomeClient.module.css";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
const PERIODS = ["1D", "1W", "1M", "3M", "1Y", "5Y", "10Y"];
const HOSTS = ["bankofcanada.ca", "canada.ca", "toronto.ca", "montreal.ca", "vancouver.ca", "calgary.ca", "edmonton.ca", "ottawa.ca", "winnipeg.ca", "ville.quebec.qc.ca", "halifax.ca", "ofina.on.ca", "finances.gouv.qc.ca", "gov.bc.ca", "alberta.ca", "saskatchewan.ca", "gov.mb.ca", "gnb.ca", "novascotia.ca", "princeedwardisland.ca", "gov.nl.ca", "yukon.ca", "gov.nt.ca", "gov.nu.ca"];
function bi(fr: ReactNode, en: ReactNode) { return <><span className={styles.fr}>{fr}</span><span className={styles.en}>{en}</span></>; }
function missing() { return bi("N/D", "N/A"); }
function pct(n: number | null | undefined) { return n == null ? missing() : bi(n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %", n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %"); }
function bp(n: number | null | undefined) { return n == null ? missing() : bi((n > 0 ? "+" : "") + n.toLocaleString("fr-CA") + " pb", (n > 0 ? "+" : "") + n.toLocaleString("en-CA") + " bp"); }
function label(key: string) {
  const map: Record<string, [string, string]> = { full: ["complète", "full"], partial: ["partielle", "partial"], limited: ["limitée", "limited"], unavailable: ["indisponible", "unavailable"], delayed: ["différée", "delayed"], stale: ["périmée", "stale"], normal: ["normale", "normal"], inverted: ["inversée", "inverted"], flat: ["plate", "flat"], unknown: ["inconnue", "unknown"] };
  const [fr, en] = map[key] ?? map.unknown;
  return bi(fr, en);
}
function link(raw: string | null | undefined, fr: string, en: string) {
  if (!raw) return missing();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !HOSTS.some((host) => url.hostname === host || url.hostname.endsWith("." + host))) return missing();
  } catch { return missing(); }
  return <a href={raw} target="_blank" rel="noopener noreferrer">{bi(fr, en)} ↗</a>;
}
function quality(q: DataQuality | null | undefined) {
  return q ? <>{bi("Couverture", "Coverage")}: {label(q.status)} · {bi("Fraîcheur", "Freshness")}: {label(q.freshness)} · {q.observed_at?.slice(0, 10) ?? missing()}</> : bi("Source momentanément indisponible", "Source temporarily unavailable");
}
async function api<T>(path: string): Promise<T | null> {
  const base = process.env.ANATOLE_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(base.replace(/\/$/, "") + "/api/v1/fixed-income" + path, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) });
    return response.ok ? await response.json() as T : null;
  } catch { return null; }
}
function param(params: Params, key: string) { const value = params[key]; return typeof value === "string" ? value.slice(0, 80) : ""; }
function issueTable(rows: BondIssue[]) {
  return <div className={styles.tableScroll}><table><thead><tr><th>{bi("Émetteur", "Issuer")}</th><th>{bi("Règlement", "Settlement")}</th><th>{bi("Échéance", "Maturity")}</th><th>Coupon</th><th>{bi("Émission", "Issue amount")}</th><th>{bi("Encours", "Outstanding")}</th><th>CUSIP</th><th>{bi("Rendement marché", "Market yield")}</th><th>{bi("Source", "Source")}</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={String(row.cusip) + String(row.settlement_date) + index}><td>{row.issuer}</td><td>{row.settlement_date ?? missing()}</td><td>{row.maturity_date ?? missing()}</td><td>{pct(row.coupon_percent)}</td><td>{row.issue_amount == null ? missing() : (row.issue_amount / 1_000_000).toLocaleString() + " M " + (row.currency ?? "")}</td><td>{row.outstanding_amount == null ? missing() : (row.outstanding_amount / 1_000_000).toLocaleString() + " M " + (row.currency ?? "")}</td><td>{row.cusip ?? missing()}</td><td>{pct(row.yield_percent)}</td><td>{link(row.official_url, "Émission officielle", "Official issue")}</td></tr>)}</tbody></table></div>;
}

export default async function FixedIncomePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const requestedTab = param(params, "tab");
  const tab = ["provinces", "municipalities", "issues"].includes(requestedTab) ? requestedTab : "canada";
  const requestedPeriod = param(params, "period");
  const period = PERIODS.includes(requestedPeriod) ? requestedPeriod : "1M";
  const [curve, history] = tab === "canada" ? await Promise.all([api<CanadaCurve>("/canada/curve"), api<CurveHistory>("/canada/history?period=" + period)]) : [null, null];
  const provinces = tab === "provinces" ? await api<ProvinceProfile[]>("/provinces") : null;
  const municipalities = tab === "municipalities" ? await api<MunicipalityProfile[]>("/municipalities") : null;
  const filters = new URLSearchParams();
  for (const key of ["province", "city", "maturity_year", "currency", "type", "query"]) { const value = param(params, key); if (value) filters.set(key, value); }
  const issues = tab === "issues" ? await api<{ issues: BondIssue[]; quality: DataQuality }>("/issues?" + filters) : null;
  return <main className={styles.page}>
    <header className={styles.hero}><span className="eyebrow">ANATOLE · FIXED INCOME</span><h1>{bi("Taux & Obligations", "Rates & Bonds")}</h1><p>{bi("Courbe fédérale, dette provinciale et émissions municipales. Chaque donnée renvoie à sa source officielle.", "Federal curve, provincial debt and municipal issues. Every data point links to its official source.")}</p></header>
    <nav className={styles.tabs} aria-label="Rates and bonds sections">{(["canada", "provinces", "municipalities", "issues"]).map((item) => <a key={item} href={"/taux-obligations?tab=" + item} aria-current={tab === item ? "page" : undefined}>{item === "canada" ? "Canada" : item === "provinces" ? "Provinces" : item === "municipalities" ? bi("Municipalités", "Municipalities") : bi("Émissions", "Issues")}</a>)}</nav>
    {tab === "canada" && <>
      <section className={styles.section}><h2>{bi("Courbe de référence du Canada", "Government of Canada benchmark curve")}</h2><p>{bi("Rendements de clôture en pourcentage ; variation depuis l’observation précédente en points de base.", "Closing yields in percent; change from the previous observation in basis points.")}</p>
        <div className={styles.curveGrid}>{curve?.points.map((point) => <article key={point.tenor}><span>{point.tenor}</span><strong>{pct(point.latest)}</strong><small>{bp(point.bp_change)} · {point.observed_at?.slice(0, 10) ?? missing()} · {label(point.freshness)}</small>{link(point.source_url, "Série Valet", "Valet series")}</article>)}</div>
        {!curve && <p role="status">{quality(null)}</p>}
        <div className={styles.metrics}><span>2s10s <strong>{bp(curve?.spread_2s10s_bps)}</strong></span><span>2s5s <strong>{bp(curve?.spread_2s5s_bps)}</strong></span><span>5sLong <strong>{bp(curve?.spread_5s_long_bps)}</strong></span><span>10sLong <strong>{bp(curve?.spread_10s_long_bps)}</strong></span><span>{bi("Forme", "Shape")} <strong>{label(curve?.curve_shape ?? "unknown")}</strong></span><span>{bi("Taux directeur", "Policy rate")} <strong>{pct(curve?.policy_rate?.latest)}</strong></span></div></section>
      <section className={styles.section}><h2>{bi("Moyennes négociables et rendement réel", "Marketable averages and real yield")}</h2><div className={styles.curveGrid}>{curve?.marketable_averages.map((point) => <article key={point.tenor}><span>{point.tenor}</span><strong>{pct(point.latest)}</strong><small>{bp(point.bp_change)}</small>{link(point.source_url, "Série Valet", "Valet series")}</article>)}{curve?.real_long_yield && <article><span>{bi("Réel long terme", "Real return long-term")}</span><strong>{pct(curve.real_long_yield.latest)}</strong>{link(curve.real_long_yield.source_url, "Série Valet", "Valet series")}</article>}</div></section>
      <section className={styles.section}><h2>{bi("Historique officiel", "Official history")}</h2><nav className={styles.periods} aria-label="History period">{PERIODS.map((item) => <a key={item} href={"/taux-obligations?tab=canada&period=" + item} aria-current={period === item ? "page" : undefined}>{item}</a>)}</nav><p>{history?.observations.length ?? 0} {bi("dates disponibles", "available dates")}</p><div className={styles.tableScroll}><table><thead><tr><th>Date</th><th>2Y</th><th>5Y</th><th>10Y</th><th>Long</th></tr></thead><tbody>{history?.observations.slice(-12).reverse().map((row) => <tr key={row.observed_at}><td>{row.observed_at}</td>{["2Y", "5Y", "10Y", "Long"].map((key) => <td key={key}>{pct(row.yields_percent[key])}</td>)}</tr>)}</tbody></table></div></section>
      <p className={styles.notice}>{bi("Source : Banque du Canada Valet. Échéances approximatives, données de clôture différées. Classification 2s10s descriptive (±5 pb).", "Source: Bank of Canada Valet. Approximate tenors, delayed closing data. Descriptive 2s10s classification (±5 bp).")} {link(curve?.debt_management_url ?? "https://www.canada.ca/en/department-finance/services/publications/debt-management.html", "Gestion de la dette fédérale", "Federal debt management")}</p><p className={styles.notice}>{quality(curve?.quality)}</p>
    </>}
    {tab === "provinces" && <section className={styles.section}><h2>{bi("Profils de dette provinciale", "Provincial debt profiles")}</h2><p>{bi("Rendements secondaires provinciaux : source de marché non configurée. Les champs absents restent N/D.", "Provincial secondary-market yields: no market source configured. Missing fields remain N/A.")}</p><div className={styles.profileGrid}>{provinces?.map((row) => <article key={row.code}><h3>{row.name} <small>{row.code}</small></h3><p>{quality(row.quality)}</p><p>{bi("Programme d’emprunt", "Borrowing program")}: <strong>{row.borrowing_program_amount == null ? missing() : (row.borrowing_program_amount / 1_000_000_000).toLocaleString() + " G CAD"}</strong> {row.fiscal_year ?? ""}</p><p>{bi("Dette en cours", "Debt outstanding")}: {row.debt_outstanding ?? missing()}</p><p>{bi("Terme moyen", "Average term")}: {row.average_term ?? missing()}</p><p>{bi("Dernière émission", "Latest issue")}: {row.recent_issues[0]?.settlement_date ?? missing()}</p><p>{bi("Programme durable", "Sustainable program")}: {row.green_social_sustainable_program ?? missing()}</p>{link(row.source_urls[0], "Source officielle", "Official source")}</article>)}</div>{!provinces && <p role="status">{quality(null)}</p>}</section>}
    {tab === "municipalities" && <section className={styles.section}><h2>{bi("Dette municipale", "Municipal debt")}</h2><p>{bi("Toronto publie un tableau d’émissions ; les autres villes ont un profil limité lorsque la source est officielle.", "Toronto publishes an issues table; other cities show a limited profile when an official source exists.")}</p><div className={styles.profileGrid}>{municipalities?.map((row) => <article key={row.slug}><h3>{row.city} <small>{row.province}</small></h3><p>{quality(row.quality)}</p><p>{bi("Dette", "Debt")}: {row.debt_outstanding ?? missing()}</p><p>{bi("Émissions vérifiées", "Verified issues")}: {row.recent_issues.length}</p><p>{bi("Programme durable", "Sustainable program")}: {row.green_social_sustainable_program ?? missing()}</p>{link(row.source_urls[0], "Source officielle", "Official source")}</article>)}</div>{!municipalities && <p role="status">{quality(null)}</p>}</section>}
    {tab === "issues" && <section className={styles.section}><h2>{bi("Émissions officielles", "Official issues")}</h2><p>{bi("Le coupon n’est pas un rendement de marché. Aucun spread sans source de prix secondaire.", "Coupon is not a market yield. No spread without a secondary pricing source.")}</p><form className={styles.filters} method="get" action="/taux-obligations"><input type="hidden" name="tab" value="issues" /><input name="query" aria-label="Search an issue" placeholder="Toronto 2036" defaultValue={param(params, "query")} /><select name="province" aria-label="Province" defaultValue={param(params, "province")}><option value="">Toutes les provinces / All provinces</option><option value="ON">Ontario</option><option value="QC">Québec</option></select><input name="city" aria-label="City" placeholder="Toronto" defaultValue={param(params, "city")} /><input name="maturity_year" aria-label="Maturity year" inputMode="numeric" placeholder="2036" defaultValue={param(params, "maturity_year")} /><select name="currency" aria-label="Currency" defaultValue={param(params, "currency")}><option value="">Toutes devises / All currencies</option><option value="CAD">CAD</option><option value="USD">USD</option></select><select name="type" aria-label="Type" defaultValue={param(params, "type")}><option value="">Tous types / All types</option><option value="green">Green</option><option value="social">Social</option></select><button type="submit">{bi("Filtrer", "Filter")}</button></form><p>{issues?.issues.length ?? 0} {bi("émissions correspondant aux filtres", "issues matching filters")} · {quality(issues?.quality)}</p>{issueTable(issues?.issues ?? [])}</section>}
  </main>;
}
