import { useQueries, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppState, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QueryState, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { FeedStatus, ProvinceCode } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { spacing, typography } from "@/src/theme/tokens";
import { NewsFeed, type NewsFeedEntry } from "./NewsFeed";
import { NewsFilters } from "./NewsFilters";
import { NewsHero } from "./NewsHero";
import { NewsSourceHealth } from "./NewsSourceHealth";
import {
  dedupeNewsItems,
  dedupePersonalNews,
  filterNewsItems,
  provinceFirstNewsItems,
  rankNewsItems,
  selectPersonalNewsSymbols,
  type NewsCategoryFilter,
  type NewsFiltersState,
  type NewsRegionFilter,
} from "./model";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

const DEFAULT_FILTERS: NewsFiltersState = { primary: "all", region: "all", category: "all", search: "" };
const EMPTY_PREFERRED_REGIONS: string[] = [];
const REGIONS = new Set<NewsRegionFilter>(["all", "CA", "QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL", "prairies", "atlantic"]);
const PROVINCES = new Set<ProvinceCode>(["QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL"]);
const CATEGORIES = new Set<NewsCategoryFilter>(["all", "monetary", "inflation", "labour", "growth", "trade", "energy", "public-finance", "investment", "housing", "other"]);

function categoryFromParam(value?: string): NewsCategoryFilter {
  if (!value) return "all";
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const aliases: Record<string, NewsCategoryFilter> = { "politique-monetaire": "monetary", "monetary-policy": "monetary", travail: "labour", emploi: "labour", croissance: "growth", commerce: "trade", energie: "energy", "finances-publiques": "public-finance", investissement: "investment", logement: "housing" };
  const category = aliases[normalized] ?? normalized;
  return CATEGORIES.has(category as NewsCategoryFilter) ? category as NewsCategoryFilter : "all";
}

function regionFromParam(value?: string): NewsRegionFilter {
  const requested = value?.toLowerCase() === "prairies" || value?.toLowerCase() === "atlantic" ? value.toLowerCase() : value?.toUpperCase();
  return requested && REGIONS.has(requested as NewsRegionFilter) ? requested as NewsRegionFilter : "all";
}

function provinceCodeFromFilter(region: NewsRegionFilter): ProvinceCode | null {
  return PROVINCES.has(region as ProvinceCode) ? region as ProvinceCode : null;
}

function updatedLabel(value: string, language: "fr" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return language === "fr" ? "Mise à jour N/D" : "Updated N/A";
  return `${language === "fr" ? "Mis à jour" : "Updated"} ${date.toLocaleTimeString(language === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" })}`;
}

export function NewsIntelligenceScreen({ header, initialRegion, initialCategory, preferredRegions = EMPTY_PREFERRED_REGIONS }: { header?: ReactNode; initialRegion?: string; initialCategory?: string; preferredRegions?: string[] }) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const { workspace } = useMobileAccount();
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [filters, setFilters] = useState<NewsFiltersState>(() => ({
    ...DEFAULT_FILTERS,
    region: regionFromParam(initialRegion),
    category: categoryFromParam(initialCategory),
  }));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const region = regionFromParam(initialRegion);
    const category = categoryFromParam(initialCategory);
    const timer = setTimeout(() => setFilters((current) => current.region === region && current.category === category ? current : { ...current, region, category }), 0);
    return () => clearTimeout(timer);
  }, [initialCategory, initialRegion]);

  const news = useQuery({ queryKey: ["news", language], queryFn: ({ signal }) => marketApi.news(language, signal), enabled: appActive, staleTime: 300_000 });
  const selectedProvince = provinceCodeFromFilter(filters.region);
  const provincialMode = Boolean(selectedProvince && filters.primary !== "personal");
  const provincialNews = useQuery({
    queryKey: ["provincial-news", selectedProvince, language],
    queryFn: ({ signal }) => {
      if (!selectedProvince) throw new Error("Province required");
      return marketApi.provincialCalendar(selectedProvince, language, signal);
    },
    enabled: appActive && provincialMode,
    staleTime: 300_000,
  });
  const personalSymbols = useMemo(() => selectPersonalNewsSymbols(workspace.data), [workspace.data]);
  const personalQueries = useQueries({ queries: personalSymbols.map((ticker) => ({
    queryKey: ["stock-news", ticker, language],
    queryFn: ({ signal }: { signal: AbortSignal }) => marketApi.stockNews(ticker, ticker, language, signal),
    enabled: appActive && filters.primary === "personal",
    staleTime: 300_000,
  })) });

  const ranked = useMemo(() => rankNewsItems(dedupeNewsItems(news.data?.items ?? [])).slice(0, 3), [news.data?.items]);
  const effectiveItems = useMemo(() => provincialMode && selectedProvince && provincialNews.data
    ? provinceFirstNewsItems(provincialNews.data.latest_releases, news.data?.items ?? [], selectedProvince)
    : dedupeNewsItems(news.data?.items ?? []), [news.data?.items, provincialMode, provincialNews.data, selectedProvince]);
  const filtered = useMemo(() => filterNewsItems(effectiveItems, filters, preferredRegions), [effectiveItems, filters, preferredRegions]);
  const personal = useMemo(() => dedupePersonalNews(personalQueries.flatMap((query, index) => (query.data?.items ?? []).map((item) => ({ ...item, personal_ticker: personalSymbols[index]! })))), [personalQueries, personalSymbols]);
  const entries = useMemo<NewsFeedEntry[]>(() => filters.primary === "personal"
    ? personal.filter((item) => !filters.search.trim() || `${item.title} ${item.summary} ${item.publisher}`.toLowerCase().includes(filters.search.trim().toLowerCase())).map((item) => ({ id: `personal:${item.personal_ticker}:${item.id}`, item, ticker: item.personal_ticker }))
    : rankNewsItems(filtered).map((item) => ({ id: item.id, item })), [filtered, filters.primary, filters.search, personal]);
  const personalLoading = filters.primary === "personal" && personalQueries.some((query) => query.isLoading);
  const refreshing = news.isRefetching || (provincialMode && provincialNews.isRefetching) || personalQueries.some((query) => query.isRefetching);
  const stale = Boolean(news.data && news.isError) || Boolean(provincialMode && provincialNews.isError) || personalQueries.some((query) => Boolean(query.data && query.isError));
  const updatedAt = provincialMode && provincialNews.data ? provincialNews.data.generated_at : news.data?.generated_at;
  const activeDataAvailable = Boolean(news.data || (provincialMode && provincialNews.data));
  const activeError = activeDataAvailable ? null : (provincialMode ? provincialNews.error ?? news.error : news.error);
  const activeLoading = !activeDataAvailable && (news.isLoading || (provincialMode && provincialNews.isLoading) || personalLoading);
  const sourceStatuses = useMemo<FeedStatus[]>(() => provincialMode && provincialNews.data
    ? provincialNews.data.sources.map((source) => ({ source: source.label, status: source.status, detail: source.detail }))
    : news.data?.source_statuses ?? [], [news.data?.source_statuses, provincialMode, provincialNews.data]);
  const reset = () => setFilters(DEFAULT_FILTERS);
  const refresh = () => {
    void news.refetch();
    if (provincialMode) void provincialNews.refetch();
    if (filters.primary === "personal") for (const query of personalQueries) void query.refetch();
  };

  const contentHeader = <>
    {header}
    <ScreenHeader eyebrow={pick("ACTUALITÉS ÉCONOMIQUES", "ECONOMIC NEWS")} title={pick("Intelligence canadienne", "Canadian intelligence")} subtitle={pick("Canada, provinces, Banque du Canada et Statistique Canada.", "Canada, provinces, Bank of Canada and Statistics Canada.")} />
    {updatedAt ? <Text style={styles.updated}>{updatedLabel(updatedAt, language)}</Text> : null}
    {stale ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <QueryState error={activeError} loading={activeLoading} onRetry={refresh} />
    <NewsHero items={ranked} />
    <NewsFilters filters={filters} hasPersonal={personalSymbols.length > 0} onChange={setFilters} preferredRegions={preferredRegions} />
    {filters.primary === "personal" && personalSymbols.length > 0 ? <Text style={styles.scope}>{pick("Chargement limité à 5 titres, portefeuille en priorité.", "Loading is limited to 5 securities, portfolio first.")}</Text> : null}
  </>;
  return <SafeAreaView edges={["top"]} style={styles.safe} testID="news-intelligence-screen"><NewsFeed entries={entries} footer={<NewsSourceHealth statuses={sourceStatuses} />} header={contentHeader} onRefresh={refresh} onReset={reset} onTicker={(ticker) => router.push({ pathname: "/focus/[ticker]", params: { ticker } })} refreshing={refreshing} /></SafeAreaView>;
}

const styles = createThemedStyles((colors) => ({ safe: { flex: 1, backgroundColor: colors.background }, updated: { ...typography.caption, color: colors.textMuted }, stale: { ...typography.caption, color: colors.warning, fontWeight: "800" }, scope: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm } }));
