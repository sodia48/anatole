export type EtfHoldingDriver = {
  rank: number;
  symbol: string;
  display_symbol: string;
  name: string;
  instrument_type:
    | "equity"
    | "etf"
    | "other"
    | string;
  weight_percent: number;
  price: number | null;
  change_percent: number | null;
  contribution_percent_points:
    | number
    | null;
};

export type EtfAllocationItem = {
  key: string;
  label: string;
  weight_percent: number;
};

export type EtfHoldingsSnapshot = {
  ticker: string;
  normalized_symbol: string;
  name: string;
  provider: string;
  category: string;
  exposure: string;
  description: string | null;
  currency: string;
  price: number | null;
  change_percent: number | null;
  holdings: EtfHoldingDriver[];
  sectors: EtfAllocationItem[];
  asset_classes: EtfAllocationItem[];
  top_holdings_weight_percent: number;
  net_driver_contribution_percent_points:
    | number
    | null;
  positive_driver_contribution_percent_points:
    | number
    | null;
  negative_driver_contribution_percent_points:
    | number
    | null;
  quoted_holdings: number;
  total_holdings_returned: number;
  status:
    | "available"
    | "partial"
    | "unavailable"
    | string;
  message: string | null;
  source_name: string;
  source_url: string | null;
  generated_at: string;
  refresh_after_seconds: number;
};

export type EtfHistoryRange =
  | "5d"
  | "1mo"
  | "ytd"
  | "6mo"
  | "1y"
  | "5y"
  | "10y";

export type EtfHistoryPoint = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EtfHistorySnapshot = {
  ticker: string;
  normalized_symbol: string;
  range: EtfHistoryRange;
  range_label: string;
  currency: string;
  interval: string;
  points: EtfHistoryPoint[];
  first_close: number | null;
  last_close: number | null;
  change: number | null;
  change_percent: number | null;
  period_high: number | null;
  period_low: number | null;
  status:
    | "available"
    | "partial"
    | "unavailable"
    | string;
  message: string | null;
  source_name: string;
  source_url: string | null;
  generated_at: string;
  refresh_after_seconds: number;
};

type RawObject = Record<string, unknown>;

type CacheEnvelope<T> = {
  savedAt: number;
  data: T;
};

const RELAY_BASE = "/api/anatole";
const REQUEST_TIMEOUT_MS = 48_000;
const MAX_ATTEMPTS = 3;
const MAX_CACHE_AGE_MS =
  24 * 60 * 60 * 1000;

const RETRYABLE_STATUS = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

function objectValue(
  value: unknown,
): RawObject {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as RawObject)
    : {};
}

function stringValue(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function numberValue(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function nullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = numberValue(
    value,
    Number.NaN,
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function arrayValue(
  value: unknown,
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function validStatus(
  value: unknown,
  fallback:
    | "available"
    | "partial"
    | "unavailable",
): string {
  const status =
    stringValue(value).toLowerCase();

  return status || fallback;
}

function cacheKey(
  kind: "holdings" | "history",
  ticker: string,
  range?: EtfHistoryRange,
): string {
  return [
    "anatole",
    "etf",
    kind,
    ticker.toUpperCase(),
    range ?? "",
    "v2",
  ].join(":");
}

function readCache<T>(
  key: string,
): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const envelope = JSON.parse(
      raw,
    ) as CacheEnvelope<T>;

    if (
      !envelope ||
      typeof envelope.savedAt !==
        "number" ||
      Date.now() - envelope.savedAt >
        MAX_CACHE_AGE_MS
    ) {
      window.localStorage.removeItem(
        key,
      );
      return null;
    }

    return envelope.data;
  } catch {
    return null;
  }
}

function writeCache<T>(
  key: string,
  data: T,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const envelope: CacheEnvelope<T> = {
      savedAt: Date.now(),
      data,
    };

    window.localStorage.setItem(
      key,
      JSON.stringify(envelope),
    );
  } catch {
    // Un stockage indisponible ne doit jamais
    // empêcher l'affichage de la fiche.
  }
}

function pause(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function makeController(
  externalSignal?: AbortSignal,
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller =
    new AbortController();

  const abort = () =>
    controller.abort();

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener(
      "abort",
      abort,
      { once: true },
    );
  }

  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener(
        "abort",
        abort,
      );
    },
  };
}

async function responseMessage(
  response: Response,
): Promise<string> {
  try {
    const payload =
      objectValue(
        await response.json(),
      );

    const detail =
      stringValue(payload.detail) ||
      stringValue(payload.message);

    if (detail) {
      return detail;
    }
  } catch {
    // La réponse n'est pas forcément du JSON.
  }

  return `Erreur API ${response.status}`;
}

async function requestPath<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let lastError:
    | Error
    | null = null;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    const combined =
      makeController(signal);

    try {
      const response = await fetch(
        `${RELAY_BASE}${path}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept:
              "application/json",
          },
          signal: combined.signal,
        },
      );

      if (response.ok) {
        return (await response.json()) as T;
      }

      const message =
        await responseMessage(response);

      lastError = new Error(message);

      if (
        RETRYABLE_STATUS.has(
          response.status,
        ) &&
        attempt < MAX_ATTEMPTS
      ) {
        await pause(400 * attempt);
        continue;
      }

      throw lastError;
    } catch (caught) {
      if (signal?.aborted) {
        throw new DOMException(
          "La requête a été annulée.",
          "AbortError",
        );
      }

      lastError =
        caught instanceof Error
          ? caught
          : new Error(
              "Connexion à Anatole API impossible.",
            );

      if (attempt < MAX_ATTEMPTS) {
        await pause(400 * attempt);
        continue;
      }
    } finally {
      combined.cleanup();
    }
  }

  throw (
    lastError ??
    new Error(
      "Connexion à Anatole API impossible.",
    )
  );
}

async function requestCandidates<T>(
  paths: string[],
  signal?: AbortSignal,
): Promise<T> {
  let lastError:
    | Error
    | null = null;

  for (const path of paths) {
    try {
      return await requestPath<T>(
        path,
        signal,
      );
    } catch (caught) {
      if (
        caught instanceof DOMException &&
        caught.name === "AbortError"
      ) {
        throw caught;
      }

      lastError =
        caught instanceof Error
          ? caught
          : new Error(
              "Route API ETF indisponible.",
            );

      const message =
        lastError.message.toLowerCase();

      const routeMissing =
        message.includes("404") ||
        message.includes("405") ||
        message.includes("not found") ||
        message.includes(
          "route introuvable",
        );

      if (!routeMissing) {
        break;
      }
    }
  }

  throw (
    lastError ??
    new Error(
      "Route API ETF introuvable.",
    )
  );
}

function normalizeAllocation(
  value: unknown,
): EtfAllocationItem[] {
  return arrayValue(value)
    .map((entry) => {
      const raw =
        objectValue(entry);
      const key =
        stringValue(
          raw.key,
          stringValue(raw.label),
        );

      return {
        key,
        label: stringValue(
          raw.label,
          key,
        ),
        weight_percent:
          Math.max(
            0,
            numberValue(
              raw.weight_percent ??
                raw.weight,
            ),
          ),
      };
    })
    .filter(
      (entry) =>
        Boolean(entry.key),
    );
}

function normalizeHoldings(
  value: unknown,
  requestedTicker: string,
): EtfHoldingsSnapshot {
  const raw = objectValue(value);
  const ticker = stringValue(
    raw.ticker,
    requestedTicker,
  ).toUpperCase();

  const holdings = arrayValue(
    raw.holdings,
  )
    .map((entry, index) => {
      const item =
        objectValue(entry);
      const symbol =
        stringValue(
          item.symbol,
          stringValue(
            item.display_symbol,
          ),
        ).toUpperCase();

      const displaySymbol =
        stringValue(
          item.display_symbol,
          symbol.replace(
            /\.(TO|V|NE|CN)$/i,
            "",
          ),
        ).toUpperCase();

      return {
        rank: Math.max(
          1,
          Math.round(
            numberValue(
              item.rank,
              index + 1,
            ),
          ),
        ),
        symbol,
        display_symbol:
          displaySymbol,
        name: stringValue(
          item.name,
          displaySymbol || symbol,
        ),
        instrument_type:
          stringValue(
            item.instrument_type,
            "equity",
          ),
        weight_percent:
          Math.max(
            0,
            numberValue(
              item.weight_percent ??
                item.weight,
            ),
          ),
        price: nullableNumber(
          item.price,
        ),
        change_percent:
          nullableNumber(
            item.change_percent ??
              item.changePercent,
          ),
        contribution_percent_points:
          nullableNumber(
            item.contribution_percent_points ??
              item.contribution,
          ),
      } satisfies EtfHoldingDriver;
    })
    .filter(
      (item) =>
        Boolean(
          item.symbol ||
            item.display_symbol,
        ),
    );

  const quotedHoldings =
    Math.max(
      0,
      Math.round(
        numberValue(
          raw.quoted_holdings,
          holdings.filter(
            (item) =>
              item.change_percent !==
              null,
          ).length,
        ),
      ),
    );

  return {
    ticker,
    normalized_symbol:
      stringValue(
        raw.normalized_symbol,
        `${ticker}.TO`,
      ),
    name: stringValue(
      raw.name,
      ticker,
    ),
    provider: stringValue(
      raw.provider,
      "N/D",
    ),
    category: stringValue(
      raw.category,
      "Autres expositions",
    ),
    exposure: stringValue(
      raw.exposure,
      "Exposition ETF",
    ),
    description:
      stringValue(
        raw.description,
      ) || null,
    currency: stringValue(
      raw.currency,
      "CAD",
    ).toUpperCase(),
    price: nullableNumber(
      raw.price,
    ),
    change_percent:
      nullableNumber(
        raw.change_percent ??
          raw.changePercent,
      ),
    holdings,
    sectors:
      normalizeAllocation(
        raw.sectors,
      ),
    asset_classes:
      normalizeAllocation(
        raw.asset_classes,
      ),
    top_holdings_weight_percent:
      Math.max(
        0,
        numberValue(
          raw.top_holdings_weight_percent,
          holdings.reduce(
            (sum, item) =>
              sum +
              item.weight_percent,
            0,
          ),
        ),
      ),
    net_driver_contribution_percent_points:
      nullableNumber(
        raw.net_driver_contribution_percent_points,
      ),
    positive_driver_contribution_percent_points:
      nullableNumber(
        raw.positive_driver_contribution_percent_points,
      ),
    negative_driver_contribution_percent_points:
      nullableNumber(
        raw.negative_driver_contribution_percent_points,
      ),
    quoted_holdings:
      quotedHoldings,
    total_holdings_returned:
      Math.max(
        holdings.length,
        Math.round(
          numberValue(
            raw.total_holdings_returned,
            holdings.length,
          ),
        ),
      ),
    status: validStatus(
      raw.status,
      holdings.length
        ? "partial"
        : "unavailable",
    ),
    message:
      stringValue(raw.message) ||
      null,
    source_name:
      stringValue(
        raw.source_name,
        "Anatole API",
      ),
    source_url:
      stringValue(
        raw.source_url,
      ) || null,
    generated_at:
      stringValue(
        raw.generated_at,
        new Date().toISOString(),
      ),
    refresh_after_seconds:
      Math.max(
        30,
        Math.round(
          numberValue(
            raw.refresh_after_seconds,
            30,
          ),
        ),
      ),
  };
}

function normalizeHistoryPoint(
  value: unknown,
): EtfHistoryPoint | null {
  const raw = objectValue(value);
  const timestamp =
    stringValue(
      raw.timestamp,
      stringValue(raw.date),
    );
  const close =
    nullableNumber(raw.close);

  if (!timestamp || close === null) {
    return null;
  }

  return {
    timestamp,
    open:
      nullableNumber(raw.open) ??
      close,
    high:
      nullableNumber(raw.high) ??
      close,
    low:
      nullableNumber(raw.low) ??
      close,
    close,
    volume: Math.max(
      0,
      Math.round(
        numberValue(raw.volume),
      ),
    ),
  };
}

function normalizeHistory(
  value: unknown,
  requestedTicker: string,
  requestedRange: EtfHistoryRange,
): EtfHistorySnapshot {
  const raw = objectValue(value);
  const points =
    arrayValue(raw.points)
      .map(normalizeHistoryPoint)
      .filter(
        (
          point,
        ): point is EtfHistoryPoint =>
          point !== null,
      );

  const closes =
    points.map(
      (point) => point.close,
    );
  const firstClose =
    nullableNumber(
      raw.first_close,
    ) ??
    (closes[0] ?? null);
  const lastClose =
    nullableNumber(
      raw.last_close,
    ) ??
    (closes.at(-1) ?? null);

  const calculatedChange =
    firstClose !== null &&
    lastClose !== null
      ? lastClose - firstClose
      : null;

  const calculatedPercent =
    firstClose !== null &&
    firstClose !== 0 &&
    lastClose !== null
      ? ((lastClose - firstClose) /
          firstClose) *
        100
      : null;

  return {
    ticker: stringValue(
      raw.ticker,
      requestedTicker,
    ).toUpperCase(),
    normalized_symbol:
      stringValue(
        raw.normalized_symbol,
        `${requestedTicker.toUpperCase()}.TO`,
      ),
    range:
      stringValue(
        raw.range,
        requestedRange,
      ) as EtfHistoryRange,
    range_label:
      stringValue(
        raw.range_label,
        requestedRange,
      ),
    currency: stringValue(
      raw.currency,
      "CAD",
    ).toUpperCase(),
    interval: stringValue(
      raw.interval,
      "1d",
    ),
    points,
    first_close: firstClose,
    last_close: lastClose,
    change:
      nullableNumber(raw.change) ??
      calculatedChange,
    change_percent:
      nullableNumber(
        raw.change_percent,
      ) ?? calculatedPercent,
    period_high:
      nullableNumber(
        raw.period_high,
      ) ??
      (closes.length
        ? Math.max(...closes)
        : null),
    period_low:
      nullableNumber(
        raw.period_low,
      ) ??
      (closes.length
        ? Math.min(...closes)
        : null),
    status: validStatus(
      raw.status,
      points.length
        ? "available"
        : "unavailable",
    ),
    message:
      stringValue(raw.message) ||
      null,
    source_name:
      stringValue(
        raw.source_name,
        "Anatole API",
      ),
    source_url:
      stringValue(
        raw.source_url,
      ) || null,
    generated_at:
      stringValue(
        raw.generated_at,
        new Date().toISOString(),
      ),
    refresh_after_seconds:
      Math.max(
        30,
        Math.round(
          numberValue(
            raw.refresh_after_seconds,
            requestedRange === "5d"
              ? 30
              : 300,
          ),
        ),
      ),
  };
}

function staleHoldings(
  snapshot: EtfHoldingsSnapshot,
): EtfHoldingsSnapshot {
  return {
    ...snapshot,
    message:
      "La connexion a échoué; la dernière fiche ETF enregistrée sur cet appareil est affichée.",
  };
}

function staleHistory(
  snapshot: EtfHistorySnapshot,
): EtfHistorySnapshot {
  return {
    ...snapshot,
    message:
      "La connexion a échoué; la dernière série enregistrée sur cet appareil est affichée.",
  };
}

export async function getEtfHoldings(
  ticker: string,
  signal?: AbortSignal,
): Promise<EtfHoldingsSnapshot> {
  const cleanTicker =
    ticker.trim().toUpperCase();

  if (!cleanTicker) {
    throw new Error(
      "Le symbole de l’ETF est vide.",
    );
  }

  const encoded =
    encodeURIComponent(cleanTicker);
  const key = cacheKey(
    "holdings",
    cleanTicker,
  );

  try {
    const raw =
      await requestCandidates<unknown>(
        [
          `/api/v1/discovery/etfs/${encoded}/holdings?limit=25`,
          `/api/v1/discovery/etf/${encoded}/holdings?limit=25`,
          `/api/v1/etfs/${encoded}/holdings?limit=25`,
          `/api/v1/discovery/etf-holdings/${encoded}?limit=25`,
        ],
        signal,
      );

    const snapshot =
      normalizeHoldings(
        raw,
        cleanTicker,
      );

    writeCache(key, snapshot);
    return snapshot;
  } catch (caught) {
    const cached =
      readCache<EtfHoldingsSnapshot>(
        key,
      );

    if (cached) {
      return staleHoldings(cached);
    }

    const detail =
      caught instanceof Error
        ? caught.message
        : "Connexion à Anatole API impossible.";

    throw new Error(
      detail === "Failed to fetch"
        ? "Connexion à la fiche ETF impossible. Le relais Anatole n’a pas répondu."
        : detail,
    );
  }
}

export async function getEtfHistory(
  ticker: string,
  selectedRange: EtfHistoryRange,
  signal?: AbortSignal,
): Promise<EtfHistorySnapshot> {
  const cleanTicker =
    ticker.trim().toUpperCase();

  if (!cleanTicker) {
    throw new Error(
      "Le symbole de l’ETF est vide.",
    );
  }

  const encodedTicker =
    encodeURIComponent(cleanTicker);
  const encodedRange =
    encodeURIComponent(selectedRange);
  const key = cacheKey(
    "history",
    cleanTicker,
    selectedRange,
  );

  try {
    const raw =
      await requestCandidates<unknown>(
        [
          `/api/v1/discovery/etfs/${encodedTicker}/history?range=${encodedRange}`,
          `/api/v1/discovery/etf/${encodedTicker}/history?range=${encodedRange}`,
          `/api/v1/etfs/${encodedTicker}/history?range=${encodedRange}`,
          `/api/v1/discovery/etf-history/${encodedTicker}?range=${encodedRange}`,
        ],
        signal,
      );

    const snapshot =
      normalizeHistory(
        raw,
        cleanTicker,
        selectedRange,
      );

    writeCache(key, snapshot);
    return snapshot;
  } catch (caught) {
    const cached =
      readCache<EtfHistorySnapshot>(
        key,
      );

    if (cached) {
      return staleHistory(cached);
    }

    const detail =
      caught instanceof Error
        ? caught.message
        : "Historique ETF indisponible.";

    throw new Error(
      detail === "Failed to fetch"
        ? "Connexion à l’historique ETF impossible. Le relais Anatole n’a pas répondu."
        : detail,
    );
  }
}
