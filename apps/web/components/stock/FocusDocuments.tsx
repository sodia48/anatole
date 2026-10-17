"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { FundamentalDocumentResearch, DocumentPassage } from "@anatole/shared/fundamental-documents";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { getFundamentalDocuments } from "@/lib/api";
import { pick } from "@/lib/i18n";
import styles from "./FocusDocuments.module.css";

const topics: Record<string, [string, string]> = {
  results: ["Résultats", "Results"], cash_flow: ["Flux de trésorerie", "Cash flow"],
  capital: ["Capital", "Capital"], accounting: ["Méthodes comptables et retraitements", "Accounting and restatements"],
  outlook: ["Perspectives publiées", "Published outlook"], query: ["Recherche", "Search"],
};
const metricLabels: Record<string, [string, string]> = {
  total_revenue: ["Revenus", "Revenue"], net_income: ["Bénéfice net", "Net income"],
  operating_cash_flow: ["Flux opérationnel", "Operating cash flow"],
  free_cash_flow: ["Flux disponible", "Free cash flow"], total_debt: ["Dette totale", "Total debt"],
};

function Source({ passage, language }: { passage: DocumentPassage; language: "fr" | "en" }) {
  const label = `${passage.document_title}${passage.page_number === null ? "" : ` · ${pick(language, "page", "page")} ${passage.page_number}`}`;
  const href = passage.page_number === null ? passage.document_url : `${passage.document_url}#page=${passage.page_number}`;
  return <small>{passage.document_url.startsWith("https://") ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a> : label}
    {passage.published_at ? ` · ${passage.published_at.slice(0, 10)}` : ""}</small>;
}

export function FocusDocuments({ ticker }: { ticker: string }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [requestId, setRequestId] = useState(0);
  const [data, setData] = useState<FundamentalDocumentResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void getFundamentalDocuments(ticker, query || undefined, controller.signal)
      .then(result => setData(result))
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ticker, query, requestId]);
  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.trim() && draft.trim().length < 2) return;
    setLoading(true);
    setError(false);
    if (draft.trim() === query) setRequestId(previous => previous + 1);
    else setQuery(draft.trim());
  };
  return <section className={styles.panel} aria-label={pick(language, "Recherche dans les rapports officiels", "Official-report research")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{pick(language, "Rapports et provenance", "Reports and provenance")}</h2>
      <p>{pick(language, "Extraits littéraux de documents découverts sur le site de l’émetteur. Une page n’est indiquée que si elle a été extraite du PDF.",
        "Literal excerpts from documents discovered on the issuer site. A page is shown only when extracted from the PDF.")}</p></header>
    <form onSubmit={search} className={styles.search}><label htmlFor="focus-document-query">{pick(language, "Rechercher un terme ou une expression", "Search for a term or phrase")}</label>
      <input id="focus-document-query" value={draft} onChange={event => setDraft(event.target.value)} maxLength={120} />
      <button type="submit">{pick(language, "Rechercher", "Search")}</button></form>
    {loading ? <p role="status">{pick(language, "Lecture des rapports…", "Reading reports…")}</p> : null}
    {error ? <p role="alert">{pick(language, "Rapports temporairement indisponibles.", "Reports temporarily unavailable.")}</p> : null}
    {data ? <>
      <p>{pick(language, "Documents analysés", "Documents scanned")} : {data.documents_scanned}</p>
      {data.source_stale ? <p role="status">{pick(language, "Instantané financier périmé : vérifiez les dates des publications.", "Stale financial snapshot: check publication dates.")}</p> : null}
      {data.reported_observations.length ? <section><h3>{pick(language, "Chiffres officiels déjà extraits", "Previously extracted official figures")}</h3>
        <p>{pick(language, "Ces valeurs proviennent du moteur financier existant; aucune page n’est attribuée sans extrait vérifié.",
          "These values come from the existing financial engine; no page is assigned without a verified excerpt.")}</p>
        <div className={styles.tableWrap}><table><thead><tr><th>{pick(language, "Indicateur", "Metric")}</th><th>{pick(language, "Période", "Period")}</th>
          <th>{pick(language, "Valeur", "Value")}</th><th>{pick(language, "Source", "Source")}</th></tr></thead><tbody>
          {data.reported_observations.map((item, index) => <tr key={`${item.metric}-${item.period_end}-${index}`}>
            <th>{pick(language, ...(metricLabels[item.metric] ?? [item.metric, item.metric]))}</th><td>{item.period_end.slice(0, 10)}</td>
            <td>{new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(item.value)} {item.currency}</td>
            <td><a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.source_name}</a></td></tr>)}</tbody></table></div></section> : null}
      {data.status === "unavailable" || !data.passages.length ? <p>{pick(language, "Aucun passage vérifiable disponible pour cette recherche.", "No verifiable passage available for this search.")}</p> : null}
      <div className={styles.cards}>{data.passages.map((passage, index) => <article key={`${passage.document_url}-${passage.page_number}-${passage.topic}-${index}`} className={styles.card}>
        <h3>{pick(language, ...(topics[passage.topic] ?? [passage.topic, passage.topic]))}</h3>
        <blockquote>{passage.excerpt}</blockquote><Source passage={passage} language={language} />
      </article>)}</div>
      {data.comparisons.length ? <section><h3>{pick(language, "Passages différents entre deux rapports annuels", "Different passages across two annual reports")}</h3>
        <p>{pick(language, "Différence de texte à examiner; son importance n’est pas déduite automatiquement.", "Text difference to review; significance is not inferred automatically.")}</p>
        <div className={styles.cards}>{data.comparisons.map(item => <article key={item.topic} className={styles.card}>
          <h4>{pick(language, ...(topics[item.topic] ?? [item.topic, item.topic]))}</h4>
          <blockquote>{item.current.excerpt}</blockquote><Source passage={item.current} language={language} />
          <blockquote>{item.previous.excerpt}</blockquote><Source passage={item.previous} language={language} />
        </article>)}</div></section> : null}
      <details><summary>{pick(language, "Limites de l’analyse documentaire", "Document-analysis limits")}</summary>
        <ul>{(language === "fr" ? data.limitations_fr : data.limitations_en).map(item => <li key={item}>{item}</li>)}</ul></details>
    </> : null}
  </section>;
}
