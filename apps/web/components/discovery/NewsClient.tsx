"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  BookOpen,
  ExternalLink,
  Eye,
  Lightbulb,
  LoaderCircle,
  Newspaper,
  Search,
  Sparkles,
  X,
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
  getNewsBrief,
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
  NewsBriefResponse,
  NewsItem,
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

const DIRECT_PROVINCIAL_MACRO_PATTERN = new RegExp(
  [
    "inflation",
    "indice des prix",
    "consumer price",
    "emploi",
    "chômage",
    "population active",
    "employment",
    "unemployment",
    "labour force",
    "produit intérieur brut",
    "gross domestic product",
    "\\bpib\\b",
    "\\bgdp\\b",
    "commerce de détail",
    "commerce de gros",
    "retail trade",
    "wholesale trade",
    "exportations",
    "importations",
    "exports",
    "imports",
    "budget",
    "déficit",
    "excédent",
    "comptes publics",
    "fiscal",
    "croissance économique",
    "economic growth",
    "mises en chantier",
    "permis de bâtir",
    "housing starts",
    "building permits",
  ].join("|"),
  "i",
);

function hasPublishedDate(value: string | null): value is string {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= -86_400_000 && age <= 180 * 86_400_000;
}

function isStatCan(source: string): boolean {
  return /statistique canada|statistics canada/i.test(source);
}

function isEssentialProvincialItem(item: NewsItem): boolean {
  return isStatCan(item.source) ||
    DIRECT_PROVINCIAL_MACRO_PATTERN.test(`${item.title} ${item.summary}`);
}

function dedupeNewsItems(items: NewsDisplayItem[]): NewsDisplayItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const canonicalUrl = item.url.split("?", 1)[0].replace(/\/+$/, "").toLowerCase();
    const key = canonicalUrl || `${item.source}|${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function provinceFirstItems(items: NewsDisplayItem[]): NewsDisplayItem[] {
  const newestFirst = (left: NewsDisplayItem, right: NewsDisplayItem) =>
    Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? "");
  const direct = items.filter((item) => !isStatCan(item.source)).sort(newestFirst);
  const statcan = items.filter((item) => isStatCan(item.source)).sort(newestFirst);

  // StatCan is a resilience layer, not the main provincial feed. Once a direct
  // provincial source is available, it must remain at least as prominent as
  // the federal complement. If no direct source responds, retain a small,
  // transparent StatCan fallback rather than showing an empty screen.
  const statcanLimit = direct.length > 0
    ? Math.min(direct.length, 6)
    : 6;

  return [...direct, ...statcan.slice(0, statcanLimit)];
}

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
  const [selectedBrief, setSelectedBrief] =
    useState<NewsBriefResponse | null>(null);
  const [briefLoading, setBriefLoading] =
    useState(false);
  const [briefError, setBriefError] =
    useState(false);
  const briefRequestId = useRef(0);

  const openReader = (item: NewsDisplayItem) => {
    const requestId = ++briefRequestId.current;
    setSelectedItem(item);
    setSelectedBrief(null);
    setBriefError(false);
    setBriefLoading(true);

    void getNewsBrief({
      title: item.title,
      summary: item.summary,
      url: item.url,
      source: item.source,
      category: item.category,
      region: item.region,
      language,
    })
      .then((brief) => {
        if (briefRequestId.current !== requestId) return;
        setSelectedBrief(brief);
        setBriefError(false);
      })
      .catch(() => {
        if (briefRequestId.current !== requestId) return;
        setBriefError(true);
      })
      .finally(() => {
        if (briefRequestId.current !== requestId) return;
        setBriefLoading(false);
      });
  };

  const closeReader = () => {
    briefRequestId.current += 1;
    setSelectedItem(null);
  };

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

  useEffect(() => {
    if (!selectedItem) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        briefRequestId.current += 1;
        setSelectedItem(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedItem]);

  const items = useMemo<NewsDisplayItem[]>(() => {
    if (provinceMode) {
      const directItems = (provincialData?.latest_releases ?? [])
        .filter(
          (item) =>
            item.source_kind !== "dashboard" &&
            hasPublishedDate(item.published_at),
        )
        .map(
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

      const officialFallback = (data?.items ?? [])
        .filter(
          (item) =>
            item.regions?.includes(region) &&
            hasPublishedDate(item.published_at) &&
            isEssentialProvincialItem(item),
        )
        .map((item) => ({
          id: `official-${item.id}`,
          title: item.title,
          summary: item.summary,
          url: item.url,
          source: item.source,
          category: item.category,
          publishedAt: item.published_at,
          sentiment: null,
          sentimentScore: null,
          importance: null,
          region: regionLabel(region, language),
        }));

      return provinceFirstItems(
        dedupeNewsItems([...directItems, ...officialFallback]),
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
    ? provincialData ?? data
    : data;
  const sourceStatuses = provinceMode
    ? Array.from(
        items.reduce((grouped, item) => {
          grouped.set(item.source, (grouped.get(item.source) ?? 0) + 1);
          return grouped;
        }, new Map<string, number>()),
      ).map(([label, count]) => ({
        key: `display-${label}`,
        label,
        status: "available",
        detail: pick(
          language,
          `${count} publication${count === 1 ? "" : "s"} officielle${count === 1 ? "" : "s"} datée${count === 1 ? "" : "s"}.`,
          `${count} dated official release${count === 1 ? "" : "s"}.`,
        ),
      }))
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
              : item.status === "stale"
                ? "stale"
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

      {selectedItem ? (
        <div
          className="news-reader-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeReader();
          }}
        >
          <section
            className="panel news-reader"
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-reader-title"
          >
            <header>
              <div className="news-card-meta">
                <span>{localizeSource(selectedItem.source, language)}</span>
                <span>{selectedItem.region}</span>
                <em>{localizeCategory(selectedItem.category, language)}</em>
              </div>
              <button
                className="news-reader-close"
                type="button"
                onClick={closeReader}
                aria-label={pick(language, "Fermer le résumé", "Close summary")}
              >
                <X size={20} />
              </button>
            </header>

            <div className="news-reader-content news-brief-content">
              <p className="eyebrow news-brief-eyebrow">
                <Sparkles size={14} />
                {pick(language, "BRIEF ANATOLE", "ANATOLE BRIEF")}
              </p>
              <h2 id="news-reader-title">{selectedItem.title}</h2>

              {briefLoading ? (
                <div className="news-brief-loading" role="status">
                  <LoaderCircle size={20} />
                  <div>
                    <strong>
                      {pick(language, "Analyse de la publication officielle…", "Analyzing the official release…")}
                    </strong>
                    <span>
                      {pick(
                        language,
                        "Anatole extrait les faits, chiffres et variations utiles sans bloquer le fil d’actualités.",
                        "Anatole is extracting useful facts, figures and changes without blocking the news feed.",
                      )}
                    </span>
                  </div>
                </div>
              ) : selectedBrief ? (
                <>
                  <div className="news-brief-provenance">
                    <span>
                      {selectedBrief.source_mode === "official_page"
                        ? pick(language, "Source officielle analysée", "Official source analyzed")
                        : pick(language, "Résumé officiel analysé", "Official summary analyzed")}
                    </span>
                    <small>{selectedBrief.source_note}</small>
                  </div>

                  <section className="news-brief-lead">
                    <span>{pick(language, "EN BREF", "IN SHORT")}</span>
                    <p>{selectedBrief.summary}</p>
                  </section>

                  {selectedBrief.key_figures.length ? (
                    <section className="news-brief-section">
                      <header>
                        <BarChart3 size={16} />
                        <strong>{pick(language, "Chiffres clés", "Key figures")}</strong>
                      </header>
                      <div className="news-brief-figures">
                        {selectedBrief.key_figures.map((figure, index) => (
                          <article key={`${figure.value}-${index}`}>
                            <strong>{figure.value}</strong>
                            <span>{figure.context}</span>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {selectedBrief.changes.length ? (
                    <section className="news-brief-section">
                      <header>
                        <Eye size={16} />
                        <strong>{pick(language, "Ce qui change", "What changed")}</strong>
                      </header>
                      <ul>
                        {selectedBrief.changes.map((change, index) => (
                          <li key={`${index}-${change.slice(0, 24)}`}>{change}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section className="news-brief-insight">
                    <div>
                      <Lightbulb size={16} />
                      <span>{pick(language, "LECTURE ANATOLE", "ANATOLE READ")}</span>
                    </div>
                    <p>{selectedBrief.why_it_matters}</p>
                    <small>
                      {pick(
                        language,
                        "Mise en contexte analytique d’Anatole — distincte des faits publiés par la source.",
                        "Anatole analytical context — separate from facts published by the source.",
                      )}
                    </small>
                  </section>

                  {selectedBrief.watch.length ? (
                    <section className="news-brief-section">
                      <header>
                        <Eye size={16} />
                        <strong>{pick(language, "À surveiller", "What to watch")}</strong>
                      </header>
                      <ul>
                        {selectedBrief.watch.map((watch, index) => (
                          <li key={`${index}-${watch.slice(0, 24)}`}>{watch}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              ) : (
                <section className="news-brief-lead news-brief-fallback">
                  <span>
                    {pick(
                      language,
                      briefError ? "RÉSUMÉ OFFICIEL — MODE SECOURS" : "EN BREF",
                      briefError ? "OFFICIAL SUMMARY — FALLBACK" : "IN SHORT",
                    )}
                  </span>
                  <p>
                    {selectedItem.summary || pick(
                      language,
                      "Aucun résumé officiel n’est disponible pour cette publication.",
                      "No official summary is available for this publication.",
                    )}
                  </p>
                </section>
              )}
            </div>

            <footer>
              {selectedItem.publishedAt ? (
                <time dateTime={selectedItem.publishedAt}>
                  {formatter.format(new Date(selectedItem.publishedAt))} ET
                </time>
              ) : <span />}
              <a
                href={selectedItem.url}
                target="_blank"
                rel="noreferrer"
              >
                {pick(language, "Consulter la source officielle", "View official source")}
                <ExternalLink size={15} />
              </a>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
