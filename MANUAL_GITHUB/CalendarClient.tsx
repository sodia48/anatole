"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CalendarDays,
  ExternalLink,
  Search,
} from "lucide-react";

import {
  usePreferences,
} from "@/components/providers/PreferencesProvider";
import {
  localizeCategory,
  localizeFeedDetail,
  localizeImportance,
  localizeSource,
  localeFor,
  pick,
} from "@/lib/i18n";
import {
  getCalendarSnapshot,
} from "@/lib/api";
import type {
  CalendarSnapshot,
} from "@/lib/types";
import {
  REGION_CODES,
  matchesRegion,
  regionLabel,
  regionSummary,
  type RegionCode,
} from "@/lib/regions";

export function CalendarClient() {
  const { preferences } =
    usePreferences();
  const language =
    preferences.language;

  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        localeFor(language),
        {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone:
            "America/Toronto",
        },
      ),
    [language],
  );

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        localeFor(language),
        {
          hour: "2-digit",
          minute: "2-digit",
          timeZone:
            "America/Toronto",
        },
      ),
    [language],
  );

  const [data, setData] =
    useState<CalendarSnapshot | null>(
      null,
    );
  const [error, setError] =
    useState<string | null>(null);
  const [query, setQuery] =
    useState("");
  const [importance, setImportance] =
    useState("Toutes");
  const [category, setCategory] =
    useState("Toutes");
  const [region, setRegion] =
    useState<RegionCode>("ALL");

  useEffect(() => {
    let active = true;
    let controller =
      new AbortController();

    setData(null);
    setError(null);

    const load = async () => {
      controller.abort();
      controller =
        new AbortController();

      try {
        const snapshot =
          await getCalendarSnapshot(
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
              "Le calendrier officiel est temporairement indisponible. Une nouvelle tentative sera faite automatiquement.",
              "The official calendar is temporarily unavailable. Anatole will retry automatically.",
            ),
          );
        }
      }
    };

    void load();

    const timer =
      window.setInterval(
        () => void load(),
        30 * 60_000,
      );

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [language]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          data?.events.map(
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
      data?.events ?? []
    ).filter((item) => {
      const text =
        `${item.title} ${
          item.description ?? ""
        }`.toLowerCase();

      return (
        (!normalized ||
          text.includes(
            normalized,
          )) &&
        (importance === "Toutes" ||
          item.importance ===
            importance) &&
        matchesRegion(
          item.regions,
          region,
        ) &&
        (category === "Toutes" ||
          item.category ===
            category)
      );
    });
  }, [
    category,
    data,
    importance,
    query,
    region,
  ]);

  const grouped = useMemo(() => {
    const map =
      new Map<
        string,
        typeof filtered
      >();

    for (const event of filtered) {
      const key =
        dayFormatter.format(
          new Date(
            event.starts_at,
          ),
        );

      map.set(key, [
        ...(map.get(key) ?? []),
        event,
      ]);
    }

    return Array.from(
      map.entries(),
    );
  }, [
    dayFormatter,
    filtered,
  ]);

  if (!data && !error) {
    return (
      <section className="panel discovery-loading">
        <span className="live-dot" />
        <div>
          <h1>
            {pick(
              language,
              "Préparation du calendrier",
              "Preparing calendar",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Synchronisation des dates nationales et des indicateurs offrant une lecture provinciale.",
              "Synchronizing national dates and indicators with provincial coverage.",
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
              "CALENDRIER OFFICIEL",
              "OFFICIAL CALENDAR",
            )}
          </span>
          <h1>
            {pick(
              language,
              "Événements économiques",
              "Economic events",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Dates futures des principaux indicateurs canadiens, avec une lecture par province lorsque les données régionales sont publiées.",
              "Upcoming Canadian economic indicators, with province-level coverage when regional data are published.",
            )}
          </p>
        </div>

        <div className="discovery-score">
          <CalendarDays size={20} />
          <strong>
            {filtered.length}
          </strong>
          <span>
            {pick(
              language,
              "événements futurs",
              "upcoming events",
            )}
          </span>
          <small>
            {pick(
              language,
              "Canada + 10 provinces · heure de Toronto",
              "Canada + 10 provinces · Toronto time",
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
              "CPI, emploi, PIB, taux…",
              "CPI, jobs, GDP, rates…",
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
            onChange={(event) =>
              setRegion(
                event.target.value as RegionCode,
              )
            }
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
              "Importance",
              "Importance",
            )}
          </span>
          <select
            value={importance}
            onChange={(event) =>
              setImportance(
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
            <option value="Très élevée">
              {pick(
                language,
                "Très élevée",
                "Very high",
              )}
            </option>
            <option value="Élevée">
              {pick(
                language,
                "Élevée",
                "High",
              )}
            </option>
            <option value="Moyenne">
              {pick(
                language,
                "Moyenne",
                "Medium",
              )}
            </option>
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
      </section>

      <section className="calendar-groups">
        {grouped.map(
          ([day, events]) => (
            <div
              className="calendar-day"
              key={day}
            >
              <h2>{day}</h2>

              <div className="calendar-events">
                {events.map((event) => (
                  <article
                    className="panel calendar-event"
                    key={event.id}
                  >
                    <time>
                      {timeFormatter.format(
                        new Date(
                          event.starts_at,
                        ),
                      )}
                    </time>

                    <span
                      className={`importance importance-${event.importance
                        .toLowerCase()
                        .replaceAll(
                          " ",
                          "-",
                        )}`}
                    >
                      {localizeImportance(
                        event.importance,
                        language,
                      )}
                    </span>

                    <div>
                      <strong>
                        {event.title}
                      </strong>
                      <small>
                        {regionSummary(
                          event.regions,
                          language,
                        )}{" "}
                        ·{" "}
                        {localizeCategory(
                          event.category,
                          language,
                        )}{" "}
                        ·{" "}
                        {localizeSource(
                          event.source,
                          language,
                        )}{" "}
                        · {event.currency}
                      </small>

                      {event.description ? (
                        <p>
                          {
                            event.description
                          }
                        </p>
                      ) : null}
                    </div>

                    {event.url ? (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={pick(
                          language,
                          "Ouvrir la source officielle",
                          "Open official source",
                        )}
                      >
                        <ExternalLink
                          size={17}
                        />
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ),
        )}

        {!grouped.length ? (
          <div className="panel empty-filter">
            <CalendarDays size={24} />
            <strong>
              {pick(
                language,
                "Aucun événement ne correspond aux filtres.",
                "No event matches the filters.",
              )}
            </strong>
          </div>
        ) : null}
      </section>
    </div>
  );
}
