"use client";

import { pick } from "@/lib/i18n";
import { FocusSeriesChart } from "./FocusSeriesChart";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import styles from "./FocusEarnings.module.css";

const tr = pick;

type Quarter = { period: string; actual: number | null; estimate: number | null; surprise_percent: number | null };
type Events = { earnings_dates: string[]; ex_dividend_date: string | null; dividend_date: string | null };

export function FocusEarnings({ history, events, currency, language, source }: {
  history: Quarter[]; events: Events; currency: string; language: "fr" | "en"; source: string;
}) {
  const [mode, choose] = useFocusMode("anatole.focus.earnings.view.v2", ["table", "cards", "charts"]);
  const ordered = [...history].sort((a, b) => a.period.localeCompare(b.period));
  const locale = language === "fr" ? "fr-CA" : "en-CA";
  const number = (value: number | null) => value === null ? "N/D" : new Intl.NumberFormat(locale,
    { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  const percent = (value: number | null) => value === null ? "N/D" : `${value > 0 ? "+" : ""}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} %`;
  const eventItems = [
    ...events.earnings_dates.map(value => [tr(language, "Publication des résultats", "Earnings release"), value]),
    [tr(language, "Date ex-dividende", "Ex-dividend date"), events.ex_dividend_date],
    [tr(language, "Versement du dividende", "Dividend payment"), events.dividend_date],
  ].filter((item): item is [string, string] => Boolean(item[1])).sort((a, b) => a[1].localeCompare(b[1]));

  return <div className={styles.root}>
    <section className={styles.panel}><header className={styles.header}><div>
      <span className="eyebrow">{tr(language, "BÉNÉFICES PAR ACTION", "EARNINGS PER SHARE")}</span>
      <h2>{tr(language, "Réel, consensus et surprise", "Actual, consensus, and surprise")}</h2></div>
      <FocusViewMode mode={mode} choose={choose} modes={["table", "cards", "charts"]} language={language}
        label={tr(language, "Mode d’affichage du BPA", "EPS display mode")} />
    </header>
      {mode === "charts" ? <div className={styles.charts} data-testid="earnings-chart-view">
        <FocusSeriesChart storageKey="earnings.eps" title={tr(language, "BPA réel et consensus publié", "Published actual EPS and consensus")}
          periods={ordered.map(row => row.period)} source={source} language={language} currency={currency} unit="per_share" kind="bar"
          series={[{ id: "actual", label: tr(language, "Réel", "Actual"), values: ordered.map(row => row.actual), nature: "published" },
            { id: "estimate", label: tr(language, "Consensus", "Consensus"), values: ordered.map(row => row.estimate), nature: "estimate" }]} />
        <FocusSeriesChart storageKey="earnings.surprise" title={tr(language, "Surprise de BPA publiée", "Published EPS surprise")}
          periods={ordered.map(row => row.period)} source={source} language={language} unit="percent" kind="bar"
          series={[{ id: "surprise", label: tr(language, "Surprise", "Surprise"), values: ordered.map(row => row.surprise_percent) }]} />
      </div> : <div className={styles.tableWrap} data-mode={mode} data-testid={mode === "table" ? "earnings-table-view" : "earnings-card-view"}>
        <table><caption className={styles.srOnly}>{tr(language, "Historique de BPA publié", "Published EPS history")}</caption>
          <thead><tr><th scope="col">{tr(language, "Trimestre", "Quarter")}</th><th scope="col">{tr(language, "Réel", "Actual")}</th>
            <th scope="col">{tr(language, "Consensus", "Consensus")}</th><th scope="col">{tr(language, "Surprise", "Surprise")}</th></tr></thead>
          <tbody>{ordered.length ? ordered.map(row => <tr key={row.period}><th scope="row">{row.period}</th>
            <td data-label={tr(language, "Réel", "Actual")}>{number(row.actual)}</td>
            <td data-label={tr(language, "Consensus", "Consensus")}>{number(row.estimate)}</td>
            <td data-label={tr(language, "Surprise", "Surprise")}>{percent(row.surprise_percent)}</td></tr>)
            : <tr><td colSpan={4}>{tr(language, "Aucun historique de BPA publié.", "No published EPS history.")}</td></tr>}</tbody>
        </table></div>}
    </section>
    <section className={styles.panel}><h2>{tr(language, "Prochaines dates", "Upcoming dates")}</h2>
      {eventItems.length ? <ol className={styles.timeline}>{eventItems.map(([label, value], index) =>
        <li key={`${label}-${value}-${index}`}><time dateTime={value}>{value}</time><span>{label}</span></li>)}</ol>
        : <p>{tr(language, "Aucune date publiée.", "No published date.")}</p>}
    </section>
  </div>;
}
