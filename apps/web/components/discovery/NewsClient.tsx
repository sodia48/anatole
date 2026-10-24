"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BookOpen,
  ExternalLink,
  Newspaper,
  Search,
} from "@/components/layout/AppIcons";
import type { ReaderArticle } from "@/components/news/NewsIntelligenceReader";

import {
  usePreferences,
} from "@/components/providers/PreferencesProvider";
import {
  localizeCategory,
  localizeFeedDetail,
  localizeImportance,
  localizeSentiment,
  localizeSource,
  localeFor,
  pick,
} from "@/lib/i18n";
import { getNewsSnapshot } from "@/lib/api";
import {
  REFRESH_INTERVALS,
} from "@/lib/refresh";
import {
  REGION_CODES,
  matchesRegion,
  regionLabel,
  regionSummary,
  type RegionCode,
} from "@/lib/regions";
import type { NewsSnapshot } from "@/lib/types";
import {
  getProvincialMacroSnapshot,
  isProvinceRegion,
  type ProvincialMacroSnapshot,
} from "@/lib/provincial-macro";

const NewsIntelligenceReader = dynamic(
  () => import("@/components/news/NewsIntelligenceReader").then((module) => module.NewsIntelligenceReader),
  { ssr: false },
);

type NewsDisplayItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: string;
  publishedAt: string | null;
  imageUrl?: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  importance: string | null;
  region: string;
};

type ProvinceModule = { provinceItems: (releases: ProvincialMacroSnapshot["latest_releases"],
  official: NewsSnapshot["items"], region: RegionCode, provinceName: string) => NewsDisplayItem[];
  provinceStatuses: (items: NewsDisplayItem[], language: "fr" | "en") => Array<{
    key: string; label: string; status: string; detail: string; lastSuccessAt: null }> };

export function NewsClient() {
  const { preferences } =
    usePreferences();
  const language =
    preferences.language;

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        localeFor(language),
        {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone:
            "America/Toronto",
        },
      ),
    [language],
  );

  const [data, setData] =
    useState<NewsSnapshot | null>(
      null,
    );
  const [provincialData, setProvincialData] =
    useState<ProvincialMacroSnapshot | null>(
      null,
    );
  const [error, setError] =
    useState<string | null>(null);
  const [query, setQuery] =
    useState("");
  const [source, setSource] =
    useState("Toutes");
  const [category, setCategory] =
    useState("Toutes");
  const [sentiment, setSentiment] =
    useState("Tous");
  const [region, setRegion] =
    useState<RegionCode>("ALL");
  const [selectedItem, setSelectedItem] =
    useState<NewsDisplayItem | null>(null);
  const selectedArticle = useMemo<ReaderArticle | null>(() => selectedItem ? {
    title: selectedItem.title,
    summary: selectedItem.summary,
    url: selectedItem.url,
    source: selectedItem.source,
    category: selectedItem.category,
    region: selectedItem.region,
    publishedAt: selectedItem.publishedAt,
    imageUrl: selectedItem.imageUrl,
    context: "macro",
  } : null, [selectedItem]);
  const openReader = (item: NewsDisplayItem) => setSelectedItem(item);
  const closeReader = () => setSelectedItem(null);
  const provinceMode =
    isProvinceRegion(region);
  const [provinceTools, setProvinceTools] = useState<ProvinceModule | null>(null);
  useEffect(() => {
    if (!provinceMode || provinceTools) return;
    let active = true;
    const moduleUrl = "/news-province-items.mjs";
    void import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl)
      .then((module) => { if (active) setProvinceTools(module as ProvinceModule); })
      .catch(() => { if (active) setError(pick(language, "Le fil provincial ne peut pas être affiché.", "Provincial feed cannot be displayed.")); });
    return () => { active = false; };
  }, [provinceMode, provinceTools, language]);

  useEffect(() => {
    let active = true;
    let controller =
      new AbortController();

    /*
     * Lors d’un changement de langue, ne jamais laisser l’ancien
     * contenu anglais/français à l’écran en attendant la nouvelle
     * édition officielle.
     */
    queueMicrotask(() => {
      if (!active) return;
      setData(null);
      setProvincialData(null);
      setError(null);
    });

    const load = async () => {
      controller.abort();
      controller =
        new AbortController();

      try {
        if (provinceMode) {
          const [provinceResult, newsResult] = await Promise.allSettled([
            getProvincialMacroSnapshot(region, language, controller.signal),
            getNewsSnapshot(language, controller.signal),
          ]);

          if (provinceResult.status === "rejected" && newsResult.status === "rejected") {
            throw provinceResult.reason;
          }

          if (active && !controller.signal.aborted) {
            setProvincialData(
              provinceResult.status === "fulfilled" ? provinceResult.value : null,
            );
            setData(newsResult.status === "fulfilled" ? newsResult.value : null);
            setError(null);
          }
          return;
        }

        const snapshot = await getNewsSnapshot(language, controller.signal);

        if (
          active &&
          !controller.signal.aborted
        ) {
          setData(snapshot as NewsSnapshot);
          setError(null);
        }
      } catch {
        if (
          active &&
          !controller.signal.aborted
        ) {
          setError(
            pick(
              language,
              provinceMode
                ? "Les sources économiques provinciales ne répondent pas pour le moment. Anatole n’invente aucune publication et réessaiera automatiquement."
                : "Les flux officiels ne répondent pas pour le moment. Anatole réessaiera automatiquement.",
              provinceMode
                ? "Provincial economic sources are not responding right now. Anatole does not fabricate releases and will retry automatically."
                : "Official feeds are not responding right now. Anatole will retry automatically.",
            ),
          );
        }
      }
    };

    void load();

    const timer =
      window.setInterval(
        () => {
          if (!document.hidden) void load();
        },
        REFRESH_INTERVALS.news,
      );

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [language, provinceMode, region]);

  const items = useMemo<NewsDisplayItem[]>(() => {
    if (provinceMode) {
      return provinceTools?.provinceItems(provincialData?.latest_releases ?? [], data?.items ?? [],
        region, regionLabel(region, language)) ?? [];
    }

    return (data?.items ?? [])
      .filter((item) =>
        matchesRegion(
          item.regions,
          region,
        ),
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: item.source,
        category: item.category,
        publishedAt: item.published_at,
        imageUrl: item.image_url,
        sentiment: item.sentiment,
        sentimentScore:
          item.sentiment_score,
        importance: null,
        region: regionSummary(
          item.regions,
          language,
        ),
      }));
  }, [
    data,
    language,
    provinceMode,
    provinceTools,
    provincialData,
    region,
  ]);

  const sources = useMemo(
    () =>
      Array.from(
        new Set(
          items.map(
            (item) => item.source,
          ),
        ),
      ).sort(),
    [items],
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          items.map(
            (item) => item.category,
          ),
        ),
      ).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const normalized =
      query.trim().toLowerCase();

    return (
      items
    ).filter((item) => {
      const text =
        `${item.title} ${item.summary}`
          .toLowerCase();

      return (
        (!normalized ||
          text.includes(
            normalized,
          )) &&
        (source === "Toutes" ||
          item.source === source) &&
        (category === "Toutes" ||
          item.category ===
            category) &&
        (provinceMode || sentiment === "Tous" ||
          item.sentiment ===
            sentiment)
      );
    });
  }, [
    category,
    items,
    provinceMode,
    query,
    sentiment,
    source,
  ]);

  const activeData = provinceMode
    ? provinceTools ? provincialData ?? data : null
    : data;
  const statcanFeeds = (data?.source_statuses ?? []).filter((item) =>
    item.source.startsWith("Statistique Canada"),
  );
  const statcanFeed = statcanFeeds.find((item) => item.status === "ok")
    ?? statcanFeeds.find((item) => item.status === "stale") ?? statcanFeeds[0];
  const statcanFeedStatus = statcanFeed ? {
    key: "statcan-feed",
    label: "Statistique Canada",
    status: statcanFeed.status === "ok" ? "available"
      : statcanFeed.status === "stale" ? "stale" : "unavailable",
    detail: statcanFeed.status === "ok"
      ? pick(language, "Flux officiel accessible", "Official feed available")
      : pick(language, "Flux officiel temporairement indisponible", "Official feed temporarily unavailable"),
    lastSuccessAt: statcanFeeds.find((item) => item.last_success_at)?.last_success_at ?? null,
  } : null;
  const sourceStatuses = provinceMode
    ? provinceTools?.provinceStatuses(items, language) ?? []
    : [
        ...(statcanFeedStatus ? [statcanFeedStatus] : []),
        ...(data?.source_statuses ?? [])
        .filter((item) => item.source.startsWith("Banque du Canada"))
        .map((item) => ({
          key: item.source,
          label: item.source,
          status:
            item.status === "ok"
              ? "available"
              : item.status === "stale"
                ? "stale"
              : "unavailable",
          detail: item.detail,
          lastSuccessAt: item.last_success_at ?? null,
        })),
      ];
  const statcanIssue = sourceStatuses.find((item) =>
    item.label.startsWith("Statistique Canada") && item.status !== "available",
  );
  const sourceIssueCount = sourceStatuses.filter((item) =>
    item.status === "unavailable" || item.status === "stale",
  ).length;

  if (!activeData && !error) {
    return (
      <section className="panel discovery-loading">
        <span className="live-dot" />
        <div>
          <h1>
            {pick(
              language,
              "Synchronisation des actualités",
              "Synchronizing news",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Connexion aux publications fédérales et aux sources économiques provinciales officielles.",
              "Connecting to federal publications and official provincial economic sources.",
            )}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div>
          <span className="eyebrow">
            {pick(
              language,
              "ACTUALITÉS OFFICIELLES",
              "OFFICIAL NEWS",
            )}
          </span>
          <h1>
            {pick(
              language,
              provinceMode
                ? `Fil macro — ${provincialData?.province ?? region}`
                : "Fil macro canadien",
              provinceMode
                ? `${provincialData?.province ?? region} macro feed`
                : "Canadian macro feed",
            )}
          </h1>
          <p>
            {pick(
              language,
              provinceMode
                ? "Publications économiques provinciales essentielles, sources statistiques officielles en priorité et sans communiqués gouvernementaux génériques."
                : "Publications économiques officielles du Canada et des provinces, catégorisées et accompagnées d’une lecture de sentiment simple et explicable.",
              provinceMode
                ? "Essential provincial economic releases, prioritizing official statistical sources and excluding generic government announcements."
                : "Official economic publications from Canada and the provinces, categorized and paired with a simple, explainable sentiment reading.",
            )}
          </p>
        </div>

        <div className="discovery-score">
          <Newspaper size={20} />
          <strong>
            {filtered.length}
          </strong>
          <span>
            {pick(
              language,
              "publications",
              "publications",
            )}
          </span>
          <small>
            {pick(
              language,
              provinceMode
                ? `${provincialData?.province ?? region} · mode province-first`
                : "Canada + 10 provinces · mise à jour toutes les 15 minutes",
              provinceMode
                ? `${provincialData?.province ?? region} · province-first mode`
                : "Canada + 10 provinces · refresh every 15 minutes",
            )}
          </small>
        </div>
      </header>

      {error ? (
        <div className="cockpit-warning">
          {error}
        </div>
      ) : null}

      {provincialData?.message ? (
        <div className="cockpit-warning">
          {provincialData.message}
        </div>
      ) : null}

      {statcanIssue ? <p className="source-status-notice" role="status">
        {pick(language,
          "Certaines publications de Statistique Canada sont temporairement indisponibles.",
          "Some Statistics Canada releases are temporarily unavailable.")}
        {statcanIssue.lastSuccessAt ? ` ${pick(language, "Dernière collecte réussie", "Last successful collection")}: ${new Date(statcanIssue.lastSuccessAt).toLocaleDateString(localeFor(language))}.` : null}
      </p> : null}
      <details className="panel source-status-details">
        <summary>{pick(language, "État des sources", "Source status")}{sourceIssueCount ? ` · ${sourceIssueCount}` : ""}</summary>
      <section className="source-status-grid">
        {sourceStatuses.map(
          (item) => (
            <article
              className={`panel source-status source-${item.status === "unavailable" ? "unavailable" : "ok"}`}
              key={item.key}
            >
              <span>
                {item.status === "available"
                  ? pick(
                      language,
                      "Disponible",
                      "Available",
                    )
                  : item.status === "stale"
                    ? pick(
                        language,
                        "Dernières données disponibles",
                        "Latest available data",
                      )
                  : item.status === "partial"
                    ? pick(
                        language,
                        "Partielle",
                        "Partial",
                      )
                    : pick(
                      language,
                      "Indisponible",
                      "Unavailable",
                    )}
              </span>
              <strong>
                {localizeSource(
                  item.label,
                  language,
                )}
              </strong>
              <small>
                {localizeFeedDetail(
                  item.detail,
                  language,
                )}
              </small>
            </article>
          ),
        )}
      </section>
      </details>

      <section className="panel filter-bar">
        <label className="filter-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder={pick(
              language,
              "Rechercher inflation, emploi, taux…",
              "Search inflation, jobs, rates…",
            )}
          />
        </label>

        <label>
          <span>
            {pick(
              language,
              "Région",
              "Region",
            )}
          </span>
          <select
            value={region}
            onChange={(event) => {
              setSource("Toutes");
              setRegion(
                event.target.value as RegionCode,
              );
            }}
          >
            {REGION_CODES.map((code) => (
              <option
                key={code}
                value={code}
              >
                {regionLabel(
                  code,
                  language,
                )}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>
            {pick(
              language,
              "Source",
              "Source",
            )}
          </span>
          <select
            value={source}
            onChange={(event) =>
              setSource(
                event.target.value,
              )
            }
          >
            <option value="Toutes">
              {pick(
                language,
                "Toutes",
                "All",
              )}
            </option>
            {sources.map((item) => (
              <option
                key={item}
                value={item}
              >
                {localizeSource(
                  item,
                  language,
                )}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>
            {pick(
              language,
              "Catégorie",
              "Category",
            )}
          </span>
          <select
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value,
              )
            }
          >
            <option value="Toutes">
              {pick(
                language,
                "Toutes",
                "All",
              )}
            </option>
            {categories.map((item) => (
              <option
                key={item}
                value={item}
              >
                {localizeCategory(
                  item,
                  language,
                )}
              </option>
            ))}
          </select>
        </label>

        {!provinceMode ? (
          <label>
            <span>
              {pick(
                language,
                "Sentiment",
                "Sentiment",
              )}
            </span>
            <select
              value={sentiment}
              onChange={(event) =>
                setSentiment(
                  event.target.value,
                )
              }
            >
              <option value="Tous">
                {pick(
                  language,
                  "Tous",
                  "All",
                )}
              </option>
              <option value="Positif">
                {pick(
                  language,
                  "Positif",
                  "Positive",
                )}
              </option>
              <option value="Neutre">
                {pick(
                  language,
                  "Neutre",
                  "Neutral",
                )}
              </option>
              <option value="Négatif">
                {pick(
                  language,
                  "Négatif",
                  "Negative",
                )}
              </option>
            </select>
          </label>
        ) : null}
      </section>

      <section className="news-grid">
        {filtered.map((item) => (
          <article
            className="panel news-card"
            key={item.id}
          >
            <div className="news-card-meta">
              <span>
                {localizeSource(
                  item.source,
                  language,
                )}
              </span>
              <span>
                {item.region}
              </span>
              <em>
                {localizeCategory(
                  item.category,
                  language,
                )}
              </em>
              <time>
                {item.publishedAt
                  ? `${formatter.format(
                      new Date(
                        item.publishedAt,
                      ),
                    )} ET`
                  : pick(
                      language,
                      "Date non publiée",
                      "Date not published",
                    )}
              </time>
            </div>

            <h2>{item.title}</h2>

            {item.summary ? (
              <p className="news-card-summary">
                {item.summary}
              </p>
            ) : null}

            <div className="news-card-footer">
              {item.sentiment !== null && item.sentimentScore !== null ? (
                <span
                  className={`sentiment sentiment-${item.sentiment.toLowerCase()}`}
                >
                  {localizeSentiment(
                    item.sentiment,
                    language,
                  )}{" "}
                  {item.sentimentScore > 0
                    ? "+"
                    : ""}
                  {item.sentimentScore.toFixed(
                    0,
                  )}
                </span>
              ) : item.importance ? (
                <span
                  className={`importance importance-${item.importance
                    .toLowerCase()
                    .replaceAll(" ", "-")}`}
                >
                  {localizeImportance(
                    item.importance,
                    language,
                  )}
                </span>
              ) : null}

              <div className="news-card-actions">
                <button
                  type="button"
                  onClick={() => openReader(item)}
                >
                  <BookOpen size={14} />
                  {pick(language, "Lire le résumé", "Read summary")}
                </button>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {pick(
                    language,
                    "Source officielle",
                    "Official source",
                  )}
                  <ExternalLink
                    size={14}
                  />
                </a>
              </div>
            </div>
          </article>
        ))}

        {!filtered.length ? (
          <div className="panel empty-filter">
            <Newspaper size={24} />
            <strong>
              {pick(
                language,
                "Aucune publication ne correspond aux filtres.",
                "No publication matches the filters.",
              )}
            </strong>
          </div>
        ) : null}
      </section>

      {selectedArticle ? (
        <NewsIntelligenceReader
          key={selectedItem?.id}
          article={selectedArticle}
          language={language}
          onClose={closeReader}
        />
      ) : null}
    </div>
  );
}
