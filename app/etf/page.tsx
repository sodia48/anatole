"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
      const controller =
        new AbortController();

      try {
        const snapshot =
          await getEtfDirectory(
            controller.signal,
          );
        const normalized =
          normalizeSnapshot(snapshot);

        setDirectory(normalized);
        setError(null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Le répertoire ETF est temporairement indisponible.",
        );
      } finally {
        setLoading(false);
      }

      return () =>
        controller.abort();
    }, []);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    const interval =
      window.setInterval(
        () => void loadDirectory(),
        directory.refreshAfterSeconds *
          1000,
      );

    return () =>
      window.clearInterval(interval);
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
