"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  EtfHeatmap,
  type EtfHeatmapItem,
} from "../../components/etf/EtfHeatmap";
import { getEtfDirectory } from "../../lib/api";

import styles from "./page.module.css";

type RawObject = Record<string, unknown>;

type DirectoryState = {
  items: EtfHeatmapItem[];
  generatedAt: string | null;
  refreshAfterSeconds: number;
};

const EMPTY_DIRECTORY: DirectoryState = {
  items: [],
  generatedAt: null,
  refreshAfterSeconds: 15,
};

const ETF_DIRECTORY_CACHE_KEY =
  "anatole:etf-directory:v3";
const ETF_DIRECTORY_CACHE_TTL_MS =
  12 * 60 * 60 * 1000;

function hasUsableQuote(
  item: EtfHeatmapItem,
): boolean {
  return (
    item.price > 0 &&
    item.source.trim().toLowerCase() !==
      "unavailable"
  );
}

function mergeDirectory(
  current: DirectoryState,
  incoming: DirectoryState,
): DirectoryState {
  if (incoming.items.length === 0) {
    return current.items.length
      ? {
          ...current,
          generatedAt:
            incoming.generatedAt ??
            current.generatedAt,
          refreshAfterSeconds:
            incoming.refreshAfterSeconds,
        }
      : incoming;
  }

  const previousByTicker = new Map(
    current.items.map((item) => [
      item.ticker,
      item,
    ]),
  );

  const mergedItems = incoming.items.map(
    (item) => {
      const previous =
        previousByTicker.get(
          item.ticker,
        );

      if (
        hasUsableQuote(item) ||
        !previous ||
        !hasUsableQuote(previous)
      ) {
        return item;
      }

      /*
       * Une réponse partielle ne doit jamais effacer une cotation déjà
       * valide. Les métadonnées éditoriales restent celles du nouvel
       * instantané, tandis que la dernière cotation fiable est conservée.
       */
      return {
        ...item,
        price: previous.price,
        changePercent:
          previous.changePercent,
        volume: previous.volume,
        currency: previous.currency,
        delayed: true,
        source: previous.source,
      };
    },
  );

  const incomingTickers = new Set(
    mergedItems.map(
      (item) => item.ticker,
    ),
  );

  for (const previous of current.items) {
    if (
      !incomingTickers.has(
        previous.ticker,
      )
    ) {
      mergedItems.push(previous);
    }
  }

  return {
    items: mergedItems,
    generatedAt:
      incoming.generatedAt ??
      current.generatedAt,
    refreshAfterSeconds:
      incoming.refreshAfterSeconds,
  };
}

function readCachedDirectory():
  | DirectoryState
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        ETF_DIRECTORY_CACHE_KEY,
      );

    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      directory?: DirectoryState;
    };

    if (
      !parsed.savedAt ||
      !parsed.directory ||
      Date.now() - parsed.savedAt >
        ETF_DIRECTORY_CACHE_TTL_MS
    ) {
      return null;
    }

    if (
      !Array.isArray(
        parsed.directory.items,
      )
    ) {
      return null;
    }

    return parsed.directory;
  } catch {
    return null;
  }
}

function writeCachedDirectory(
  directory: DirectoryState,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ETF_DIRECTORY_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        directory,
      }),
    );
  } catch {
    // Le cache navigateur est une amélioration facultative.
  }
}

function stringValue(
  item: RawObject,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = item[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return fallback;
}

function numberValue(
  item: RawObject,
  keys: string[],
): number {
  for (const key of keys) {
    const value = item[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function booleanValue(
  item: RawObject,
  key: string,
  fallback = true,
): boolean {
  const value = item[key];

  return typeof value === "boolean"
    ? value
    : fallback;
}

function normalizeItem(
  item: RawObject,
): EtfHeatmapItem {
  const ticker = stringValue(
    item,
    ["ticker", "symbol"],
  ).toUpperCase();

  return {
    ticker,
    name: stringValue(
      item,
      ["name"],
      ticker,
    ),
    provider: stringValue(
      item,
      ["provider", "issuer"],
      "Autre",
    ),
    sector: stringValue(
      item,
      ["category", "sector"],
      "Autres expositions",
    ),
    exposure: stringValue(
      item,
      ["exposure", "description"],
      "Exposition diversifiée",
    ),
    region: stringValue(
      item,
      ["region"],
      "Canada / Global",
    ),
    price: numberValue(
      item,
      ["price"],
    ),
    changePercent: numberValue(
      item,
      [
        "change_percent",
        "changePercent",
      ],
    ),
    volume: numberValue(
      item,
      ["volume"],
    ),
    currency: stringValue(
      item,
      ["currency"],
      "CAD",
    ),
    delayed: booleanValue(
      item,
      "delayed",
      true,
    ),
    source: stringValue(
      item,
      ["source"],
      "unavailable",
    ),
  };
}

function normalizeSnapshot(
  value: unknown,
): DirectoryState {
  const raw =
    value &&
    typeof value === "object"
      ? (value as RawObject)
      : {};

  const sourceItems =
    Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.etfs)
        ? raw.etfs
        : [];

  const items = sourceItems
    .filter(
      (item): item is RawObject =>
        Boolean(item) &&
        typeof item === "object",
    )
    .map(normalizeItem)
    .filter((item) => item.ticker);

  return {
    items,
    generatedAt:
      typeof raw.generated_at ===
      "string"
        ? raw.generated_at
        : null,
    refreshAfterSeconds: Math.max(
      15,
      numberValue(
        raw,
        ["refresh_after_seconds"],
      ) || 15,
    ),
  };
}

export default function EtfPage() {
  const requestRef =
    useRef<AbortController | null>(
      null,
    );
  const [directory, setDirectory] =
    useState<DirectoryState>(
      EMPTY_DIRECTORY,
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const [query, setQuery] =
    useState("");
  const [
    selectedSector,
    setSelectedSector,
  ] = useState("Tous");
  const [
    selectedProvider,
    setSelectedProvider,
  ] = useState("Tous");

  const loadDirectory =
    useCallback(async () => {
      requestRef.current?.abort();

      const controller =
        new AbortController();
      requestRef.current = controller;

      try {
        const snapshot =
          await getEtfDirectory(
            controller.signal,
          );
        const normalized =
          normalizeSnapshot(snapshot);

        if (controller.signal.aborted) {
          return;
        }

        setDirectory((current) => {
          const merged =
            mergeDirectory(
              current,
              normalized,
            );

          writeCachedDirectory(merged);
          return merged;
        });
        setError(null);
      } catch (caught) {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Le répertoire ETF est temporairement indisponible.",
        );
      } finally {
        if (
          requestRef.current ===
          controller
        ) {
          setLoading(false);
        }
      }
    }, []);

  useEffect(() => {
    const cached =
      readCachedDirectory();

    if (cached?.items.length) {
      setDirectory(cached);
      setLoading(false);
    }

    void loadDirectory();

    return () => {
      requestRef.current?.abort();
    };
  }, [loadDirectory]);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        void loadDirectory();
      }
    };

    const interval =
      window.setInterval(
        refresh,
        directory.refreshAfterSeconds *
          1000,
      );

    document.addEventListener(
      "visibilitychange",
      refresh,
    );

    return () => {
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        refresh,
      );
    };
  }, [
    directory.refreshAfterSeconds,
    loadDirectory,
  ]);

  const sectors = useMemo(
    () =>
      Array.from(
        new Set(
          directory.items.map(
            (item) => item.sector,
          ),
        ),
      ),
    [directory.items],
  );

  const providers = useMemo(
    () =>
      Array.from(
        new Set(
          directory.items.map(
            (item) => item.provider,
          ),
        ),
      ).sort((left, right) =>
        left.localeCompare(
          right,
          "fr",
        ),
      ),
    [directory.items],
  );

  const filteredItems = useMemo(() => {
    const needle = query
      .trim()
      .toLocaleLowerCase("fr");

    return directory.items.filter(
      (item) => {
        if (
          selectedSector !== "Tous" &&
          item.sector !==
            selectedSector
        ) {
          return false;
        }

        if (
          selectedProvider !==
            "Tous" &&
          item.provider !==
            selectedProvider
        ) {
          return false;
        }

        if (!needle) {
          return true;
        }

        return [
          item.ticker,
          item.name,
          item.provider,
          item.sector,
          item.exposure,
          item.region,
        ].some((value) =>
          value
            .toLocaleLowerCase("fr")
            .includes(needle),
        );
      },
    );
  }, [
    directory.items,
    query,
    selectedProvider,
    selectedSector,
  ]);

  const quotedCount =
    directory.items.filter(
      (item) => item.price > 0,
    ).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span
            className={styles.eyebrow}
          >
            RÉPERTOIRE ETF
          </span>
          <h1>
            Carte des ETF canadiens
          </h1>
          <p>
            Regroupement sectoriel,
            cotations de séance,
            liquidité et accès rapide
            aux principaux ETF suivis
            par Anatole.
          </p>
        </div>

        <div
          className={
            styles.heroMetrics
          }
        >
          <div>
            <strong>
              {loading &&
              !directory.items.length
                ? "—"
                : directory.items.length}
            </strong>
            <span>ETF suivis</span>
          </div>
          <div>
            <strong>
              {quotedCount}
            </strong>
            <span>
              cotations actives
            </span>
          </div>
        </div>
      </section>

      <section
        className={styles.liveBar}
      >
        <div>
          <span
            className={
              styles.liveDot
            }
          />
          <strong>LIVE</strong>
          <span>
            actualisation automatique
            toutes les{" "}
            {
              directory.refreshAfterSeconds
            }{" "}
            secondes
          </span>
        </div>

        <span>
          Données potentiellement
          différées
        </span>
      </section>

      <section
        className={styles.filters}
      >
        <label
          className={styles.search}
        >
          <span aria-hidden="true">
            ⌕
          </span>
          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="Ticker, secteur, fournisseur ou exposition"
            aria-label="Rechercher un ETF"
          />
        </label>

        <label
          className={
            styles.selectField
          }
        >
          <span>SECTEUR</span>
          <select
            value={selectedSector}
            onChange={(event) =>
              setSelectedSector(
                event.target.value,
              )
            }
          >
            <option value="Tous">
              Tous les secteurs
            </option>
            {sectors.map(
              (sector) => (
                <option
                  key={sector}
                  value={sector}
                >
                  {sector}
                </option>
              ),
            )}
          </select>
        </label>

        <label
          className={
            styles.selectField
          }
        >
          <span>FOURNISSEUR</span>
          <select
            value={
              selectedProvider
            }
            onChange={(event) =>
              setSelectedProvider(
                event.target.value,
              )
            }
          >
            <option value="Tous">
              Tous
            </option>
            {providers.map(
              (provider) => (
                <option
                  key={provider}
                  value={provider}
                >
                  {provider}
                </option>
              ),
            )}
          </select>
        </label>
      </section>

      {error ? (
        <div
          className={
            styles.errorBanner
          }
        >
          {error} Les dernières
          données chargées restent
          affichées.
        </div>
      ) : null}

      <EtfHeatmap
        items={filteredItems}
      />

      <footer
        className={styles.footer}
      >
        Répertoire éditorial
        Anatole et cotations
        publiques potentiellement
        différées. Dernière
        synchronisation :{" "}
        {directory.generatedAt
          ? new Intl.DateTimeFormat(
              "fr-CA",
              {
                dateStyle: "medium",
                timeStyle: "medium",
              },
            ).format(
              new Date(
                directory.generatedAt,
              ),
            )
          : "en cours"}
        .
      </footer>
    </main>
  );
}
