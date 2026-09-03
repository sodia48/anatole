import type {
  AlertSnapshot,
  CalendarSnapshot,
  CockpitSnapshot,
  EarningsSnapshot,
  InsiderSnapshot,
  NewsSnapshot,
  PortfolioSnapshot,
  PsychologySnapshot,
  ScreenerSnapshot,
  TerminalMarketDriver,
  TerminalSnapshot,
  WatchlistSnapshot,
} from "@/src/lib/api/types";

export type TodayLanguage = "fr" | "en";
export type TodayUniverse = "composite" | "tsx60";
export type TodayPhase = "pre_market" | "session" | "post_market" | "off_hours";
export type TodayTone = "positive" | "negative" | "watch" | "neutral";

export type TodayPhaseResult = {
  phase: TodayPhase;
  title: string;
  greeting: string;
  marketStatus: string;
  quoteIsCurrent: boolean;
};

export type TodayMarketReading = { headline: string; detail: string; tone: TodayTone };

export type TodayTarget =
  | { kind: "stock"; ticker: string }
  | { kind: "sector"; universe: TodayUniverse; sector: string }
  | { kind: "terminal"; symbol?: string; anomaly?: string }
  | { kind: "screener"; universe: TodayUniverse; sector?: string; signal?: string }
  | { kind: "calendar" }
  | { kind: "insider"; ticker: string }
  | { kind: "news"; url: string };

export type TodayAttentionItem = {
  id: string;
  kind: "alert" | "anomaly" | "calendar" | "earnings" | "rotation" | "screener" | "insider" | "news";
  symbol: string | null;
  title: string;
  detail: string;
  priority: number;
  tone: TodayTone;
  badge: string | null;
  count: number;
  target: TodayTarget;
};

export type TodayHeatmapMode = "stocks" | "sectors" | "anomalies";
export type TodayHeatmapNode = {
  id: string;
  label: string;
  weight: number;
  changePercent: number;
  symbol: string | null;
  sector: string | null;
  anomalyType: string | null;
};
export type TodayUnmappedAnomaly = { id: string; symbol: string | null; type: string; title: string };
export type TodayHeatmapData = { nodes: TodayHeatmapNode[]; unmapped: TodayUnmappedAnomaly[] };

export type TodayTimelineItem = {
  id: string;
  kind: "calendar" | "earnings" | "market_marker";
  title: string;
  startsAt: string;
  importance: string;
  region: string | null;
  ticker: string | null;
  target: TodayTarget;
};

const TORONTO = "America/Toronto";

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: value("weekday"),
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function torontoDateKey(date: Date): string {
  const parts = zonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function zonedDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const initial = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const viewed = zonedParts(initial);
  const viewedAsUtc = Date.UTC(viewed.year, viewed.month - 1, viewed.day, viewed.hour, viewed.minute);
  return new Date(initial.getTime() - (viewedAsUtc - initial.getTime()));
}

export function isCurrentTorontoQuote(now: Date, quoteAsOf: string | null | undefined): boolean {
  if (!quoteAsOf) return false;
  const quote = new Date(quoteAsOf);
  if (Number.isNaN(quote.getTime()) || quote.getTime() > now.getTime() + 5 * 60_000) return false;
  return torontoDateKey(quote) === torontoDateKey(now) && now.getTime() - quote.getTime() <= 30 * 60_000;
}

export function resolveTodayPhase(now: Date, quoteAsOf?: string | null, language: TodayLanguage = "fr"): TodayPhaseResult {
  const parts = zonedParts(now);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const minutes = parts.hour * 60 + parts.minute;
  const phase: TodayPhase = weekend ? "off_hours" : minutes < 9 * 60 + 30 ? "pre_market" : minutes <= 16 * 60 ? "session" : "post_market";
  const title = language === "fr"
    ? ({ pre_market: "À surveiller avant l’ouverture", session: "Ce qui se passe maintenant", post_market: "Résumé de la séance", off_hours: "Le prochain regard marché" } as const)[phase]
    : ({ pre_market: "Before the open", session: "What is happening now", post_market: "Session recap", off_hours: "The next market look" } as const)[phase];
  const quoteIsCurrent = phase === "session" && isCurrentTorontoQuote(now, quoteAsOf);
  return {
    phase,
    title,
    greeting: language === "fr" ? (parts.hour >= 18 ? "Bonsoir" : "Bonjour") : (parts.hour >= 18 ? "Good evening" : "Hello"),
    marketStatus: quoteIsCurrent
      ? (language === "fr" ? "Données de séance à jour" : "Current session data")
      : (language === "fr" ? "Dernières données disponibles" : "Latest available data"),
    quoteIsCurrent,
  };
}

export function latestCockpitQuoteTime(cockpit: CockpitSnapshot | null | undefined): string | null {
  const values = (cockpit?.constituents ?? [])
    .map((item) => new Date(item.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!values.length) return null;
  return new Date(Math.max(...values.map((date) => date.getTime()))).toISOString();
}

function pct(value: number, language: TodayLanguage): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function regime(value: string, language: TodayLanguage): string {
  if (language === "fr") return value.toLowerCase();
  return ({ Haussier: "bullish", Constructif: "constructive", Neutre: "neutral", Fragile: "fragile", Baissier: "bearish" } as Record<string, string>)[value] ?? value.toLowerCase();
}

export function buildTodayMarketReading(input: {
  cockpit?: CockpitSnapshot | null;
  terminal?: TerminalSnapshot | null;
  psychology?: PsychologySnapshot | null;
  universe: TodayUniverse;
  language: TodayLanguage;
}): TodayMarketReading {
  const { cockpit, terminal, psychology, universe, language } = input;
  if (!cockpit) {
    return {
      headline: language === "fr" ? "Lecture du marché en attente" : "Market reading pending",
      detail: language === "fr" ? "Les données disponibles apparaîtront progressivement." : "Available data will appear progressively.",
      tone: "neutral",
    };
  }
  const change = cockpit.weighted_change_percent;
  const tone: TodayTone = change > 0.05 ? "positive" : change < -0.05 ? "negative" : "neutral";
  const label = universe === "composite" ? "S&P/TSX Composite" : "S&P/TSX 60";
  const directional = cockpit.breadth.advancers + cockpit.breadth.decliners;
  const participation = directional > 0 ? Math.round(cockpit.breadth.advancers / directional * 100) : null;
  const sorted = [...cockpit.sectors].sort((left, right) => right.change_percent - left.change_percent);
  const leading = sorted[0];
  const trailing = sorted.at(-1);
  const headline = language === "fr"
    ? `${label} ${change >= 0 ? "progresse" : "recule"} de ${pct(Math.abs(change), language)}.`
    : `${label} is ${change >= 0 ? "up" : "down"} ${pct(Math.abs(change), language)}.`;
  const observations: string[] = [];
  if (participation !== null) observations.push(language === "fr" ? `${participation} % des mouvements directionnels sont positifs.` : `${participation}% of directional moves are positive.`);
  if (leading && trailing) observations.push(language === "fr" ? `${leading.sector} mène (${pct(leading.change_percent, language)}), tandis que ${trailing.sector} est sous pression (${pct(trailing.change_percent, language)}).` : `${leading.sector} leads (${pct(leading.change_percent, language)}), while ${trailing.sector} is under pressure (${pct(trailing.change_percent, language)}).`);
  if (terminal?.regime) observations.push(language === "fr" ? `Le régime Terminal · TSX 60 demeure ${regime(terminal.regime, language)}.` : `The Terminal · TSX 60 regime remains ${regime(terminal.regime, language)}.`);
  if (psychology) observations.push(language === "fr" ? `La psychologie observée est ${psychology.label.toLowerCase()} (${Math.round(psychology.score)}/100).` : `Observed psychology is ${psychology.label.toLowerCase()} (${Math.round(psychology.score)}/100).`);
  return { headline, detail: observations.join(" "), tone };
}

const DRIVER_ORDER = ["wti", "gold", "cadusd", "canada_10y", "copper", "natural_gas", "sp500", "nasdaq", "vix", "canada_2y"];

export function selectTodayDrivers(drivers: readonly TerminalMarketDriver[], limit = 5): TerminalMarketDriver[] {
  return [...drivers]
    .filter((item) => item.status !== "unavailable")
    .sort((left, right) => {
      const leftRank = DRIVER_ORDER.indexOf(left.key);
      const rightRank = DRIVER_ORDER.indexOf(right.key);
      return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
    })
    .slice(0, limit);
}

export function driverMove(driver: TerminalMarketDriver, language: TodayLanguage): string {
  if (driver.change_1d == null) return "N/D";
  const value = driver.change_1d.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 });
  return `${driver.change_1d > 0 ? "+" : ""}${value} ${driver.change_unit} / ${language === "fr" ? "1J" : "1D"}`;
}

export function driverRelationship(driver: TerminalMarketDriver, language: TodayLanguage): string | null {
  const value = driver.correlation_60d_to_tsx;
  if (value == null) return null;
  const strength = Math.abs(value) >= 0.7 ? (language === "fr" ? "fortement " : "strongly ") : "";
  const direction = value >= 0
    ? (language === "fr" ? "positive" : "positive")
    : (language === "fr" ? "négative" : "negative");
  return language === "fr"
    ? `Corrélation récente ${strength}${direction} avec le TSX`
    : `Recent ${strength}${direction} correlation with the TSX`;
}

function isToday(value: string, now: Date): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && torontoDateKey(date) === torontoDateKey(now);
}

function personalBadge(symbol: string | null, watchlist: Set<string>, portfolio: Set<string>, language: TodayLanguage): string | null {
  if (!symbol) return null;
  if (portfolio.has(symbol)) return language === "fr" ? "Dans votre portefeuille" : "In your portfolio";
  if (watchlist.has(symbol)) return language === "fr" ? "Dans votre watchlist" : "In your watchlist";
  return null;
}

export function buildTodayAttention(input: {
  alerts?: AlertSnapshot | null;
  terminal?: TerminalSnapshot | null;
  calendar?: CalendarSnapshot | null;
  earnings?: EarningsSnapshot | null;
  screener?: ScreenerSnapshot | null;
  insiders?: InsiderSnapshot | null;
  news?: NewsSnapshot | null;
  watchlistSymbols?: readonly string[];
  portfolioSymbols?: readonly string[];
  universe: TodayUniverse;
  language: TodayLanguage;
  now: Date;
}): TodayAttentionItem[] {
  const watchlist = new Set((input.watchlistSymbols ?? []).map((item) => item.toUpperCase()));
  const portfolio = new Set((input.portfolioSymbols ?? []).map((item) => item.toUpperCase()));
  const candidates: TodayAttentionItem[] = [];
  const add = (item: Omit<TodayAttentionItem, "badge" | "count">) => {
    const badge = personalBadge(item.symbol, watchlist, portfolio, input.language);
    candidates.push({ ...item, badge, count: 1, priority: item.priority + (badge ? 12 : 0) });
  };
  for (const item of input.alerts?.items ?? []) if (item.triggered) add({ id: `alert:${item.id}`, kind: "alert", symbol: item.symbol, title: `${item.symbol} · ${input.language === "fr" ? "alerte déclenchée" : "alert triggered"}`, detail: item.message, priority: 100, tone: "watch", target: { kind: "stock", ticker: item.symbol } });
  for (const item of input.terminal?.anomalies ?? []) if (item.severity === "high" || item.severity === "watch") add({ id: `anomaly:${item.id}`, kind: "anomaly", symbol: item.symbol, title: item.title, detail: item.detail, priority: item.severity === "high" ? 90 : 80, tone: item.direction === "positive" ? "positive" : item.direction === "negative" ? "negative" : "watch", target: { kind: "terminal", symbol: item.symbol ?? undefined, anomaly: item.type } });
  for (const item of input.calendar?.events ?? []) if (item.importance.toLowerCase() === "high" && isToday(item.starts_at, input.now)) add({ id: `calendar:${item.id}`, kind: "calendar", symbol: null, title: item.title, detail: `${(item.regions?.length ? item.regions : [item.country]).join(" · ")} · ${item.category}`, priority: 76, tone: "watch", target: { kind: "calendar" } });
  const earningsCutoff = input.now.getTime() + 3 * 86_400_000;
  for (const item of input.earnings?.events ?? []) {
    const time = new Date(item.starts_at).getTime();
    if (Number.isFinite(time) && time >= input.now.getTime() && time <= earningsCutoff) add({ id: `earnings:${item.ticker}:${item.starts_at}`, kind: "earnings", symbol: item.symbol, title: `${item.ticker} · ${input.language === "fr" ? "résultats à venir" : "upcoming earnings"}`, detail: item.company, priority: 72, tone: "neutral", target: { kind: "stock", ticker: item.ticker } });
  }
  for (const item of input.terminal?.sector_rotation ?? []) if ((item.quadrant === "LEADERSHIP" || item.quadrant === "SOUS PRESSION") && item.x != null && item.y != null) add({ id: `rotation:${item.sector}`, kind: "rotation", symbol: null, title: `${item.sector} · ${item.state}`, detail: input.language === "fr" ? "État sectoriel observé dans Terminal Pro." : "Sector state observed in Pro Terminal.", priority: 64, tone: item.quadrant === "LEADERSHIP" ? "positive" : "negative", target: { kind: "sector", universe: input.universe, sector: item.sector } });
  for (const item of input.screener?.items ?? []) if (item.score >= 75 || item.relative_volume >= 1.5 || Math.abs(item.momentum_20d) >= 10) add({ id: `screener:${item.symbol}`, kind: "screener", symbol: item.symbol, title: `${item.symbol} · ${item.signal}`, detail: `Score ${Math.round(item.score)} · ${input.language === "fr" ? "volume relatif" : "relative volume"} ${item.relative_volume.toFixed(1)}×`, priority: 56, tone: item.change_percent > 0 ? "positive" : item.change_percent < 0 ? "negative" : "neutral", target: { kind: "screener", universe: input.universe, sector: item.sector, signal: item.signal } });
  for (const item of input.insiders?.trades ?? []) if (item.unusual) add({ id: `insider:${item.id}`, kind: "insider", symbol: item.ticker, title: `${item.ticker} · ${input.language === "fr" ? "déclaration inhabituelle" : "unusual filing"}`, detail: `${item.insider_name} · ${item.transaction_label}`, priority: 54, tone: "watch", target: { kind: "insider", ticker: item.ticker } });
  for (const item of input.news?.items.slice(0, 3) ?? []) add({ id: `news:${item.id}`, kind: "news", symbol: null, title: item.title, detail: item.summary, priority: 35, tone: "neutral", target: { kind: "news", url: item.url } });

  const merged = new Map<string, TodayAttentionItem>();
  for (const item of candidates.sort((left, right) => right.priority - left.priority)) {
    const key = item.symbol ? `symbol:${item.symbol.toUpperCase()}` : `${item.kind}:${item.id}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, item);
      continue;
    }
    const details = [...new Set([current.detail, item.detail])].slice(0, 2);
    merged.set(key, {
      ...current,
      title: `${item.symbol} · ${current.count + 1} ${input.language === "fr" ? "éléments à surveiller" : "items to monitor"}`,
      detail: details.join(" · "),
      priority: Math.max(current.priority, item.priority),
      badge: current.badge ?? item.badge,
      count: current.count + 1,
    });
  }
  return [...merged.values()].sort((left, right) => right.priority - left.priority).slice(0, 5);
}

export function buildTodayHeatmap(mode: TodayHeatmapMode, cockpit?: CockpitSnapshot | null, terminal?: TerminalSnapshot | null): TodayHeatmapData {
  if (!cockpit) return { nodes: [], unmapped: [] };
  if (mode === "stocks") {
    const unique = new Map<string, CockpitSnapshot["constituents"][number]>();
    for (const item of [...cockpit.top_gainers.slice(0, 5), ...cockpit.top_losers.slice(0, 5)]) if (!unique.has(item.symbol)) unique.set(item.symbol, item);
    return { nodes: [...unique.values()].slice(0, 10).map((item) => ({ id: item.symbol, label: item.symbol, weight: item.weight, changePercent: item.change_percent, symbol: item.symbol, sector: item.sector, anomalyType: null })), unmapped: [] };
  }
  if (mode === "sectors") return { nodes: cockpit.sectors.slice(0, 12).map((item) => ({ id: item.sector, label: item.sector, weight: item.weight, changePercent: item.change_percent, symbol: null, sector: item.sector, anomalyType: null })), unmapped: [] };
  const bySymbol = new Map(cockpit.constituents.map((item) => [item.symbol.toUpperCase(), item]));
  const nodes: TodayHeatmapNode[] = [];
  const unmapped: TodayUnmappedAnomaly[] = [];
  for (const anomaly of terminal?.anomalies ?? []) {
    const tile = anomaly.symbol ? bySymbol.get(anomaly.symbol.toUpperCase()) : undefined;
    if (!tile) {
      unmapped.push({ id: anomaly.id, symbol: anomaly.symbol, type: anomaly.type, title: anomaly.title });
      continue;
    }
    nodes.push({ id: anomaly.id, label: anomaly.symbol!, weight: tile.weight, changePercent: tile.change_percent, symbol: anomaly.symbol, sector: tile.sector, anomalyType: anomaly.type });
  }
  return { nodes, unmapped };
}

export function selectPersonalMovers(snapshot?: WatchlistSnapshot | null, limit = 3) {
  return [...(snapshot?.items ?? [])].sort((left, right) => Math.abs(right.change_percent) - Math.abs(left.change_percent)).slice(0, limit);
}

export function personalNewsTargets(watchlist?: WatchlistSnapshot | null, portfolio?: PortfolioSnapshot | null) {
  const values = [
    ...(watchlist?.items ?? []).map((item) => ({ symbol: item.symbol, company: item.name, change: item.change_percent })),
    ...(portfolio?.positions ?? []).map((item) => ({ symbol: (item.symbol ?? item.ticker).replace(/\.TO$/i, ""), company: item.name, change: item.day_change_percent })),
  ].sort((left, right) => Math.abs(right.change) - Math.abs(left.change));
  const seen = new Set<string>();
  return values.filter((item) => {
    const symbol = item.symbol.toUpperCase();
    if (seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  }).slice(0, 2);
}

function markerDate(now: Date, hour: number, minute: number): Date {
  const parts = zonedParts(now);
  return zonedDate(parts.year, parts.month, parts.day, hour, minute);
}

export function buildTodayTimeline(calendar: CalendarSnapshot | null | undefined, earnings: EarningsSnapshot | null | undefined, now: Date, language: TodayLanguage, limit = 8): TodayTimelineItem[] {
  const items: TodayTimelineItem[] = [];
  const cutoff = now.getTime() + 7 * 86_400_000;
  for (const event of calendar?.events ?? []) {
    const time = new Date(event.starts_at).getTime();
    if (!Number.isFinite(time) || time < now.getTime() - 30 * 60_000 || time > cutoff) continue;
    items.push({ id: `calendar:${event.id}`, kind: "calendar", title: event.title, startsAt: event.starts_at, importance: event.importance, region: (event.regions?.length ? event.regions : [event.country]).join(" · "), ticker: null, target: { kind: "calendar" } });
  }
  for (const event of earnings?.events ?? []) {
    const time = new Date(event.starts_at).getTime();
    if (!Number.isFinite(time) || time < now.getTime() - 30 * 60_000 || time > cutoff) continue;
    items.push({ id: `earnings:${event.ticker}:${event.starts_at}`, kind: "earnings", title: `${event.ticker} · ${event.company}`, startsAt: event.starts_at, importance: event.time_is_estimated ? (language === "fr" ? "Heure indicative" : "Estimated time") : (language === "fr" ? "Confirmé" : "Confirmed"), region: "CA", ticker: event.ticker, target: { kind: "stock", ticker: event.ticker } });
  }
  const parts = zonedParts(now);
  if (parts.weekday !== "Sat" && parts.weekday !== "Sun") {
    items.push({ id: "market:open", kind: "market_marker", title: language === "fr" ? "Ouverture habituelle TSX" : "Usual TSX open", startsAt: markerDate(now, 9, 30).toISOString(), importance: language === "fr" ? "Horaire habituel" : "Usual schedule", region: "CA", ticker: null, target: { kind: "calendar" } });
    items.push({ id: "market:close", kind: "market_marker", title: language === "fr" ? "Clôture habituelle TSX" : "Usual TSX close", startsAt: markerDate(now, 16, 0).toISOString(), importance: language === "fr" ? "Horaire habituel" : "Usual schedule", region: "CA", ticker: null, target: { kind: "calendar" } });
  }
  return items.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()).slice(0, limit);
}
