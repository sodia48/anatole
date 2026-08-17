"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ExternalLink,
  Newspaper,
  Search,
} from "lucide-react";

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
import {
  getNewsSnapshot,
} from "@/lib/api";
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
import type {
  NewsSnapshot,
} from "@/lib/types";
import {
  getProvincialMacroSnapshot,
  isProvinceRegion,
  type ProvincialMacroSnapshot,
} from "@/lib/provincial-macro";

type NewsDisplayItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: string;
  publishedAt: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  importance: string | null;
  region: string;
};

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
  const provinceMode =
    isProvinceRegion(region);

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
        const snapshot = provinceMode
          ? await getProvincialMacroSnapshot(
              region,
              language,
              controller.signal,
            )
          : await getNewsSnapshot(
              language,
              controller.signal,
            );

        if (
          active &&
          !controller.signal.aborted
        ) {
          if (provinceMode) {
            setProvincialData(
              snapshot as ProvincialMacroSnapshot,
            );
          } else {
            setData(
              snapshot as NewsSnapshot,
            );
          }
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
        () => void load(),
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
      return (provincialData?.latest_releases ?? []).map(
        (item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          url: item.source_url,
          source: item.source,
          category: item.category,
          publishedAt: item.published_at,
          sentiment: null,
          sentimentScore: null,
          importance: item.importance,
          region: item.province,
        }),
      );
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
    ? provincialData
    : data;
  const sourceStatuses = provinceMode
    ? (provincialData?.sources ?? []).map(
        (item) => ({
          key: item.key,
          label: item.label,
          status: item.status,
          detail: item.detail,
        }),
      )
    : (data?.source_statuses ?? [])
        .filter((item) =>
          item.source.startsWith("Statistique Canada") ||
          item.source.startsWith("Banque du Canada"),
        )
        .map((item) => ({
          key: item.source,
          label: item.source,
          status:
            item.status === "ok"
              ? "available"
              : "unavailable",
          detail: item.detail,
        }));

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
              <p>
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
    </div>
  );
}
