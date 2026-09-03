import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { QueryState, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { NewsFeed, type NewsFeedEntry } from "./NewsFeed";
import { NewsFilters } from "./NewsFilters";
import { NewsHero } from "./NewsHero";
import { NewsSourceHealth } from "./NewsSourceHealth";
import {
  dedupeNewsItems,
  dedupePersonalNews,
  filterNewsItems,
  rankNewsItems,
  selectPersonalNewsSymbols,
  type NewsCategoryFilter,
  type NewsFiltersState,
  type NewsRegionFilter,
} from "./model";

const DEFAULT_FILTERS: NewsFiltersState = { primary: "all", region: "all", category: "all", search: "" };
const REGIONS = new Set<NewsRegionFilter>(["all", "CA", "QC", "ON", "BC", "AB", "prairies", "atlantic"]);
const CATEGORIES = new Set<NewsCategoryFilter>(["all", "monetary", "inflation", "labour", "growth", "trade", "energy", "public-finance", "investment", "housing", "other"]);

function categoryFromParam(value?: string): NewsCategoryFilter {
  if (!value) return "all";
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const aliases: Record<string, NewsCategoryFilter> = { "politique-monetaire": "monetary", "monetary-policy": "monetary", travail: "labour", emploi: "labour", croissance: "growth", commerce: "trade", energie: "energy", "finances-publiques": "public-finance", investissement: "investment", logement: "housing" };
  const category = aliases[normalized] ?? normalized;
  return CATEGORIES.has(category as NewsCategoryFilter) ? category as NewsCategoryFilter : "all";
}

function updatedLabel(value: string, language: "fr" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return language === "fr" ? "Mise à jour N/D" : "Updated N/A";
  return `${language === "fr" ? "Mis à jour" : "Updated"} ${date.toLocaleTimeString(language === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" })}`;
}

export function NewsIntelligenceScreen({ header, initialRegion, initialCategory }: { header?: ReactNode; initialRegion?: string; initialCategory?: string }) {
  const { language, pick } = useLocale();
  const { workspace } = useMobileAccount();
  const queryClient = useQueryClient();
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [filters, setFilters] = useState<NewsFiltersState>(DEFAULT_FILTERS);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
      if (!active) {
        void queryClient.cancelQueries({ queryKey: ["news"] });
        void queryClient.cancelQueries({ queryKey: ["stock-news"] });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    const requestedRegion = initialRegion?.toLowerCase() === "prairies" || initialRegion?.toLowerCase() === "atlantic" ? initialRegion.toLowerCase() : initialRegion?.toUpperCase();
    const region = requestedRegion && REGIONS.has(requestedRegion as NewsRegionFilter) ? requestedRegion as NewsRegionFilter : "all";
    const category = categoryFromParam(initialCategory);
    const timer = setTimeout(() => setFilters((current) => current.region === region && current.category === category ? current : { ...current, region, category }), 0);
    return () => clearTimeout(timer);
  }, [initialCategory, initialRegion]);

  const news = useQuery({ queryKey: ["news", language], queryFn: ({ signal }) => marketApi.news(language, signal), enabled: appActive, staleTime: 300_000 });
  const personalSymbols = useMemo(() => selectPersonalNewsSymbols(workspace.data), [workspace.data]);
  const personalQueries = useQueries({ queries: personalSymbols.map((ticker) => ({
    queryKey: ["stock-news", ticker, language],
    queryFn: ({ signal }: { signal: AbortSignal }) => marketApi.stockNews(ticker, ticker, language, signal),
    enabled: appActive && filters.primary === "personal",
    staleTime: 300_000,
  })) });

  const ranked = useMemo(() => rankNewsItems(dedupeNewsItems(news.data?.items ?? [])).slice(0, 3), [news.data?.items]);
  const filtered = useMemo(() => filterNewsItems(dedupeNewsItems(news.data?.items ?? []), filters, initialRegion ? [initialRegion] : []), [filters, initialRegion, news.data?.items]);
  const personal = useMemo(() => dedupePersonalNews(personalQueries.flatMap((query, index) => (query.data?.items ?? []).map((item) => ({ ...item, personal_ticker: personalSymbols[index]! })))), [personalQueries, personalSymbols]);
  const entries = useMemo<NewsFeedEntry[]>(() => filters.primary === "personal"
    ? personal.filter((item) => !filters.search.trim() || `${item.title} ${item.summary} ${item.publisher}`.toLowerCase().includes(filters.search.trim().toLowerCase())).map((item) => ({ id: `personal:${item.personal_ticker}:${item.id}`, item, ticker: item.personal_ticker }))
    : rankNewsItems(filtered).map((item) => ({ id: item.id, item })), [filtered, filters.primary, filters.search, personal]);
  const personalLoading = filters.primary === "personal" && personalQueries.some((query) => query.isLoading);
  const refreshing = news.isRefetching || personalQueries.some((query) => query.isRefetching);
  const stale = Boolean(news.data && news.isError) || personalQueries.some((query) => Boolean(query.data && query.isError));
  const reset = () => setFilters(DEFAULT_FILTERS);
  const refresh = () => {
    void news.refetch();
    if (filters.primary === "personal") for (const query of personalQueries) void query.refetch();
  };

  const contentHeader = <>
    {header}
    <ScreenHeader eyebrow={pick("ACTUALITÉS ÉCONOMIQUES", "ECONOMIC NEWS")} title={pick("Intelligence canadienne", "Canadian intelligence")} subtitle={pick("Canada, provinces, Banque du Canada et Statistique Canada.", "Canada, provinces, Bank of Canada and Statistics Canada.")} />
    {news.data ? <Text style={styles.updated}>{updatedLabel(news.data.generated_at, language)}</Text> : null}
    {stale ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <QueryState error={!news.data ? news.error : null} loading={news.isLoading || personalLoading} onRetry={refresh} />
    <NewsHero items={ranked} />
    <NewsFilters filters={filters} hasPersonal={personalSymbols.length > 0} onChange={setFilters} />
    {filters.primary === "personal" && personalSymbols.length > 0 ? <Text style={styles.scope}>{pick("Chargement limité à 5 titres, portefeuille en priorité.", "Loading is limited to 5 securities, portfolio first.")}</Text> : null}
  </>;
  return <SafeAreaView edges={["top"]} style={styles.safe} testID="news-intelligence-screen"><NewsFeed entries={entries} footer={<NewsSourceHealth statuses={news.data?.source_statuses ?? []} />} header={contentHeader} onRefresh={refresh} onReset={reset} onTicker={(ticker) => router.push({ pathname: "/focus/[ticker]", params: { ticker } })} refreshing={refreshing} /></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, updated: { ...typography.caption, color: colors.textMuted }, stale: { ...typography.caption, color: colors.warning, fontWeight: "800" }, scope: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm } });
