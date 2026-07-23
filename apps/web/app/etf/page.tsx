"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getEtfDirectory } from "../../lib/api";

import styles from "./page.module.css";

type RawObject = Record<string, unknown>;

type EtfItem = {
  ticker: string;
  name: string;
  provider: string;
  sector: string;
  exposure: string;
  region: string;
  price: number;
  changePercent: number;
  volume: number;
  currency: string;
};

type DirectoryState = {
  items: EtfItem[];
  generatedAt: string | null;
  refreshAfterSeconds: number;
};

const EMPTY_DIRECTORY: DirectoryState = {
  items: [],
  generatedAt: null,
  refreshAfterSeconds: 60,
};

function stringValue(
  item: RawObject,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
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
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function normalizeItem(item: RawObject): EtfItem {
  const ticker = stringValue(item, ["ticker", "symbol"]).toUpperCase();
  return {
    ticker,
    name: stringValue(item, ["name"], ticker),
    provider: stringValue(
      item,
      ["provider", "issuer"],
      "Autre",
    ),
    sector: stringValue(
      item,
      ["sector", "category"],
      "Autres expositions",
    ),
    exposure: stringValue(
      item,
      ["exposure", "description"],
      "Exposition diversifiée",
    ),
    region: stringValue(item, ["region"], "Global"),
    price: numberValue(item, ["price"]),
    changePercent: numberValue(
      item,
      ["change_percent", "changePercent"],
    ),
    volume: numberValue(item, ["volume"]),
    currency: stringValue(item, ["currency"], "CAD"),
  };
}

function normalizeSnapshot(value: unknown): DirectoryState {
  const raw =
    value && typeof value === "object"
      ? (value as RawObject)
      : {};

  const sourceItems = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.etfs)
      ? raw.etfs
      : [];

  const items = sourceItems
    .filter(
      (item): item is RawObject =>
        Boolean(item) && typeof item === "object",
    )
    .map(normalizeItem)
    .filter((item) => item.ticker);

  return {
    items,
    generatedAt:
      typeof raw.generated_at === "string"
        ? raw.generated_at
        : null,
    refreshAfterSeconds: Math.max(
      60,
      numberValue(raw, ["refresh_after_seconds"]) || 60,
    ),
  };
}

function formatMoney(item: EtfItem): string {
  if (!(item.price > 0)) return "N/D";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: item.currency || "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(item.price);
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} %`;
}

function formatVolume(value: number): string {
  if (!(value > 0)) return "N/D";
  return new Intl.NumberFormat("fr-CA", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function averageChange(items: EtfItem[]): number | null {
  const priced = items.filter((item) => item.price > 0);
  if (!priced.length) return null;
  return (
    priced.reduce(
      (total, item) => total + item.changePercent,
      0,
    ) / priced.length
  );
}

export default function EtfPage() {
  const [directory, setDirectory] =
    useState<DirectoryState>(EMPTY_DIRECTORY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selectedSector, setSelectedSector] =
    useState("Tous");
  const [selectedProvider, setSelectedProvider] =
    useState("Tous");
  const [openSectors, setOpenSectors] = useState<Set<string>>(
    new Set(),
  );

  const loadDirectory = useCallback(async () => {
    const controller = new AbortController();

    try {
      const snapshot = await getEtfDirectory(controller.signal);
      const normalized = normalizeSnapshot(snapshot);
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

    return () => controller.abort();
  }, []);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    const interval = window.setInterval(
      () => void loadDirectory(),
      directory.refreshAfterSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [directory.refreshAfterSeconds, loadDirectory]);

  const sectors = useMemo(
    () =>
      Array.from(
        new Set(directory.items.map((item) => item.sector)),
      ),
    [directory.items],
  );

  const providers = useMemo(
    () =>
      Array.from(
        new Set(directory.items.map((item) => item.provider)),
      ).sort((left, right) =>
        left.localeCompare(right, "fr"),
      ),
    [directory.items],
  );

  useEffect(() => {
    if (!sectors.length) return;
    setOpenSectors((current) => {
      if (current.size) return current;
      return new Set(sectors);
    });
  }, [sectors]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");

    return directory.items.filter((item) => {
      if (
        selectedSector !== "Tous" &&
        item.sector !== selectedSector
      ) {
        return false;
      }
      if (
        selectedProvider !== "Tous" &&
        item.provider !== selectedProvider
      ) {
        return false;
      }
      if (!needle) return true;

      return [
        item.ticker,
        item.name,
        item.provider,
        item.sector,
        item.exposure,
        item.region,
      ].some((value) =>
        value.toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [
    directory.items,
    query,
    selectedProvider,
    selectedSector,
  ]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, EtfItem[]>();

    for (const sector of sectors) {
      groups.set(sector, []);
    }
    for (const item of filteredItems) {
      const group = groups.get(item.sector) ?? [];
      group.push(item);
      groups.set(item.sector, group);
    }

    return Array.from(groups.entries()).filter(
      ([, items]) => items.length,
    );
  }, [filteredItems, sectors]);

  function toggleSector(sector: string) {
    setOpenSectors((current) => {
      const next = new Set(current);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  }

  function showAllSectors() {
    setSelectedSector("Tous");
    setOpenSectors(new Set(sectors));
  }

  const pricedCount = directory.items.filter(
    (item) => item.price > 0,
  ).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>RÉPERTOIRE ETF</span>
          <h1>ETF canadiens par secteur</h1>
          <p>
            Marché canadien, secteurs, obligations, liquidités,
            portefeuilles tout-en-un, expositions mondiales et
            actifs réels.
          </p>
        </div>

        <div className={styles.heroMetric}>
          <span className={styles.metricIcon}>$</span>
          <strong>
            {loading && !directory.items.length
              ? "—"
              : directory.items.length}
          </strong>
          <b>ETF suivis</b>
          <small>
            {pricedCount} cotations disponibles
          </small>
        </div>
      </section>

      <section className={styles.filters}>
        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ticker, secteur, fournisseur ou exposition"
            aria-label="Rechercher un ETF"
          />
        </label>

        <label className={styles.selectField}>
          <span>SECTEUR</span>
          <select
            value={selectedSector}
            onChange={(event) =>
              setSelectedSector(event.target.value)
            }
          >
            <option value="Tous">Tous les secteurs</option>
            {sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.selectField}>
          <span>FOURNISSEUR</span>
          <select
            value={selectedProvider}
            onChange={(event) =>
              setSelectedProvider(event.target.value)
            }
          >
            <option value="Tous">Tous</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
      </section>

      <nav
        className={styles.sectorNav}
        aria-label="Accès rapide aux secteurs"
      >
        <button
          className={
            selectedSector === "Tous"
              ? styles.sectorChipActive
              : styles.sectorChip
          }
          onClick={showAllSectors}
          type="button"
        >
          Tous · {directory.items.length}
        </button>

        {sectors.map((sector) => {
          const count = directory.items.filter(
            (item) => item.sector === sector,
          ).length;
          return (
            <button
              key={sector}
              className={
                selectedSector === sector
                  ? styles.sectorChipActive
                  : styles.sectorChip
              }
              onClick={() => {
                setSelectedSector(sector);
                setOpenSectors(new Set([sector]));
              }}
              type="button"
            >
              {sector} · {count}
            </button>
          );
        })}
      </nav>

      <div className={styles.directoryToolbar}>
        <p>
          <strong>{filteredItems.length}</strong> ETF affichés dans{" "}
          <strong>{groupedItems.length}</strong>{" "}
          {groupedItems.length > 1 ? "secteurs" : "secteur"}.
        </p>
        <div>
          <button
            type="button"
            onClick={() => setOpenSectors(new Set(sectors))}
          >
            Tout ouvrir
          </button>
          <button
            type="button"
            onClick={() => setOpenSectors(new Set())}
          >
            Tout fermer
          </button>
        </div>
      </div>

      {error ? (
        <div className={styles.errorBanner}>
          {error} Les dernières données déjà chargées restent
          affichées.
        </div>
      ) : null}

      {!loading && !groupedItems.length ? (
        <section className={styles.emptyState}>
          Aucun ETF ne correspond aux filtres actuels.
        </section>
      ) : null}

      <div className={styles.groups}>
        {groupedItems.map(([sector, items]) => {
          const opened = openSectors.has(sector);
          const sectorChange = averageChange(items);

          return (
            <section
              className={styles.sectorSection}
              key={sector}
            >
              <button
                type="button"
                className={styles.sectorHeader}
                onClick={() => toggleSector(sector)}
                aria-expanded={opened}
              >
                <div>
                  <span
                    className={`${styles.chevron} ${
                      opened ? styles.chevronOpen : ""
                    }`}
                    aria-hidden="true"
                  >
                    ›
                  </span>
                  <div>
                    <h2>{sector}</h2>
                    <p>{items.length} ETF dans ce groupe</p>
                  </div>
                </div>

                <div className={styles.sectorPerformance}>
                  <small>Variation moyenne disponible</small>
                  <strong
                    className={
                      sectorChange === null
                        ? styles.neutral
                        : sectorChange >= 0
                          ? styles.positive
                          : styles.negative
                    }
                  >
                    {sectorChange === null
                      ? "N/D"
                      : formatPercent(sectorChange)}
                  </strong>
                </div>
              </button>

              {opened ? (
                <div className={styles.cardGrid}>
                  {items.map((item) => {
                    const hasQuote = item.price > 0;
                    const positive = item.changePercent >= 0;

                    return (
                      <article
                        className={styles.card}
                        key={item.ticker}
                      >
                        <div className={styles.cardTop}>
                          <span className={styles.ticker}>
                            {item.ticker}
                          </span>
                          <span className={styles.provider}>
                            {item.provider}
                          </span>
                        </div>

                        <h3>{item.name}</h3>
                        <p className={styles.exposure}>
                          {item.exposure}
                        </p>

                        <div className={styles.meta}>
                          <span>{item.region}</span>
                          <span>
                            Volume {formatVolume(item.volume)}
                          </span>
                        </div>

                        <div className={styles.quote}>
                          <strong>{formatMoney(item)}</strong>
                          <span
                            className={
                              !hasQuote
                                ? styles.neutral
                                : positive
                                  ? styles.positive
                                  : styles.negative
                            }
                          >
                            {!hasQuote
                              ? "Cotation indisponible"
                              : `${
                                  positive ? "↑" : "↓"
                                } ${formatPercent(
                                  Math.abs(item.changePercent),
                                ).replace("+", "")}`}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <footer className={styles.footer}>
        Répertoire éditorial Anatole et cotations publiques
        potentiellement différées. Mise à jour :{" "}
        {directory.generatedAt
          ? new Intl.DateTimeFormat("fr-CA", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(directory.generatedAt))
          : "en cours"}
        .
      </footer>
    </main>
  );
}
