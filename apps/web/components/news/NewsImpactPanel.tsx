"use client";

import { useEffect, useState } from "react";
import { getFocusFundamentalOverlay } from "@/lib/api";
import type { FocusFundamentalOverlaySnapshot } from "@/lib/types";
import type { ReaderArticle } from "./NewsIntelligenceReader";
import styles from "./NewsIntelligenceReader.module.css";

export function NewsImpactPanel({ article, language, onAsk }: {
  article: ReaderArticle;
  language: "fr" | "en";
  onAsk: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [data, setData] = useState<FocusFundamentalOverlaySnapshot | null>(null);
  const ticker = article.ticker;
  const tr = (fr: string, en: string) => language === "fr" ? fr : en;
  useEffect(() => {
    if (!open || !ticker) return;
    const controller = new AbortController();
    let active = true;
    void getFocusFundamentalOverlay(ticker, controller.signal)
      .then(value => { if (active) setData(value); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; controller.abort(); };
  }, [open, ticker]);

  const results = article.eventType === "results";
  const quarter = data?.quarterly_financials
    .filter(row => row.total_revenue !== null || row.diluted_eps !== null)
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  const available = results ? Boolean(quarter)
    : data?.metrics.dividend_rate != null || data?.metrics.dividend_yield != null;
  const fmt = (value: number) => value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA");
  const currency = quarter?.currency ?? data?.financial_currency ?? "";
  const source = results ? quarter?.source?.source_name ?? data?.source : data?.source;
  const date = results ? quarter?.period_end : data?.generated_at;
  const url = quarter?.source?.source_url;
  return <section className={styles.impact} aria-label={tr("Impact de la nouvelle", "News impact")}>
    <button type="button" className={styles.more} aria-expanded={open}
      onClick={() => { if (!open) setPending(true); setOpen(!open); }}>
      {tr("Comprendre l’impact", "Understand the impact")}
    </button>
    {open ? <div className={styles.impactBody}>
      {pending ? <p role="status">{tr("Recherche du contexte financier…", "Loading financial context…")}</p> : null}
      {!pending && !available ? <p className={styles.limit}>{tr(
        "Données comparables indisponibles ; impact indéterminé.",
        "Comparable data unavailable; impact undetermined.")}</p> : null}
      {!pending && available ? <>
        <div><h3>{tr("Contexte financier", "Financial context")}</h3>
          {results ? <p>{quarter?.total_revenue != null ? tr("Revenus : ", "Revenue: ") + fmt(quarter.total_revenue) + " " + currency : ""}
            {quarter?.diluted_eps != null ? tr(" · BPA dilué : ", " · Diluted EPS: ") + fmt(quarter.diluted_eps) + " " + currency : ""}</p>
            : <p>{data?.metrics.dividend_rate != null ? tr("Taux : ", "Rate: ") + fmt(data.metrics.dividend_rate) + " " + currency : ""}
              {data?.metrics.dividend_yield != null ? tr(" · Rendement : ", " · Yield: ") + fmt(data.metrics.dividend_yield) + " %" : ""}</p>}
          <small>{source} · {date?.slice(0, 10)}{data?.stale ? tr(" · donnée périmée", " · stale data") : ""}
            {url?.startsWith("https://") ? <> · <a href={url} target="_blank" rel="noopener noreferrer">{tr("Document source", "Source document")}</a></> : null}</small>
        </div>
        <div><h3>{tr("Interprétation", "Interpretation")}</h3><p>{results
          ? tr("Une tendance exige des périodes et méthodes comparables.",
            "A trend requires comparable periods and methods.")
          : tr("Le taux connu ne confirme pas le prochain versement.",
            "The known rate does not confirm the next payment.")}</p></div>
      </> : null}
      <button type="button" className={styles.more} onClick={onAsk}>{tr("Poser une question à Anatole", "Ask Anatole")}</button>
    </div> : null}
  </section>;
}
