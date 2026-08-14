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
import type {
  NewsSnapshot,
} from "@/lib/types";

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

  useEffect(() => {
    let active = true;
    let controller =
      new AbortController();

    /*
     * Lors d’un changement de langue, ne jamais laisser l’ancien
     * contenu anglais/français à l’écran en attendant la nouvelle
     * édition officielle.
     */
    setData(null);
    setError(null);

    const load = async () => {
      controller.abort();
      controller =
        new AbortController();

      try {
        const snapshot =
          await getNewsSnapshot(
            language,
            controller.signal,
          );

        if (
          active &&
          !controller.signal.aborted
        ) {
          setData(snapshot);
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
              "Les flux officiels ne répondent pas pour le moment. Anatole réessaiera automatiquement.",
              "Official feeds are not responding right now. Anatole will retry automatically.",
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
  }, [language]);

  const sources = useMemo(
    () =>
      Array.from(
        new Set(
          data?.items.map(
            (item) => item.source,
          ) ?? [],
        ),
      ).sort(),
    [data],
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          data?.items.map(
            (item) => item.category,
          ) ?? [],
        ),
      ).sort(),
    [data],
  );

  const filtered = useMemo(() => {
    const normalized =
      query.trim().toLowerCase();

    return (
      data?.items ?? []
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
        (sentiment === "Tous" ||
          item.sentiment ===
            sentiment)
      );
    });
  }, [
    category,
    data,
    query,
    sentiment,
    source,
  ]);

  if (!data && !error) {
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
              "Connexion aux publications de la Banque du Canada et de Statistique Canada.",
              "Connecting to Bank of Canada and Statistics Canada publications.",
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
              "Fil macro canadien",
              "Canadian macro feed",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Publications officielles, catégorisées et accompagnées d’une lecture de sentiment simple et explicable.",
              "Official publications, categorized and paired with a simple, explainable sentiment reading.",
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
              "Mise à jour automatique toutes les 15 minutes",
              "Automatic refresh every 15 minutes",
            )}
          </small>
        </div>
      </header>

      {error ? (
        <div className="cockpit-warning">
          {error}
        </div>
      ) : null}

      <section className="source-status-grid">
        {data?.source_statuses.map(
          (item) => (
            <article
              className={`panel source-status source-${item.status}`}
              key={item.source}
            >
              <span>
                {item.status === "ok"
                  ? pick(
                      language,
                      "Disponible",
                      "Available",
                    )
                  : pick(
                      language,
                      "Indisponible",
                      "Unavailable",
                    )}
              </span>
              <strong>
                {localizeSource(
                  item.source,
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
              <em>
                {localizeCategory(
                  item.category,
                  language,
                )}
              </em>
              <time>
                {formatter.format(
                  new Date(
                    item.published_at,
                  ),
                )}{" "}
                ET
              </time>
            </div>

            <h2>{item.title}</h2>

            {item.summary ? (
              <p>
                {item.summary}
              </p>
            ) : null}

            <div className="news-card-footer">
              <span
                className={`sentiment sentiment-${item.sentiment.toLowerCase()}`}
              >
                {localizeSentiment(
                  item.sentiment,
                  language,
                )}{" "}
                {item.sentiment_score >
                0
                  ? "+"
                  : ""}
                {item.sentiment_score.toFixed(
                  0,
                )}
              </span>

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
