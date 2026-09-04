import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { QueryState, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { FeedStatus } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { CalendarEventModal } from "./CalendarEventModal";
import { CalendarFilters } from "./CalendarFilters";
import { CalendarSourceHealth } from "./CalendarSourceHealth";
import { CalendarTimeline } from "./CalendarTimeline";
import {
  calendarRangeLabel,
  countdownLabel,
  filterCalendarItems,
  groupCalendarByTorontoDate,
  mergeCalendarEvents,
  nextMajorEvent,
  type CalendarFiltersState,
  type CalendarIntelligenceItem,
  type CalendarRange,
  type CalendarRegionFilter,
  type EconomicCalendarItem,
} from "./model";

const DEFAULT_FILTERS: CalendarFiltersState = { range: "7d", kind: "all", importance: "all", region: "all", category: "all", sector: "all", scope: "all", ticker: "" };
const REGIONS = new Set<CalendarRegionFilter>(["all", "CA", "QC", "ON", "BC", "AB", "prairies", "atlantic"]);

function rangeFromParam(value?: string): CalendarRange {
  if (value === "today" || value === "1" || value === "1d") return "today";
  if (value === "30" || value === "30d") return "30d";
  return "7d";
}

function uniqueStatuses(statuses: readonly FeedStatus[]): FeedStatus[] {
  const seen = new Set<string>();
  return statuses.filter((status) => {
    const key = `${status.source}:${status.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function CalendarIntelligenceScreen({ header, initialRegion, initialCategory, initialDateRange, initialTicker, referenceNow }: { header?: ReactNode; initialRegion?: string; initialCategory?: string; initialDateRange?: string; initialTicker?: string; referenceNow?: Date }) {
  const { language, pick } = useLocale();
  const { workspace } = useMobileAccount();
  const queryClient = useQueryClient();
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [filters, setFilters] = useState<CalendarFiltersState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<EconomicCalendarItem | null>(null);
  const [now, setNow] = useState(() => referenceNow ?? new Date());

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
      if (active && !referenceNow) setNow(new Date());
      if (!active) {
        void queryClient.cancelQueries({ queryKey: ["calendar"] });
        void queryClient.cancelQueries({ queryKey: ["earnings"] });
      }
    });
    return () => subscription.remove();
  }, [queryClient, referenceNow]);

  useEffect(() => {
    if (referenceNow || !appActive) return;
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, [appActive, referenceNow]);

  useEffect(() => {
    const requestedRegion = initialRegion?.toLowerCase() === "prairies" || initialRegion?.toLowerCase() === "atlantic" ? initialRegion.toLowerCase() : initialRegion?.toUpperCase();
    const region = requestedRegion && REGIONS.has(requestedRegion as CalendarRegionFilter) ? requestedRegion as CalendarRegionFilter : "all";
    const range = rangeFromParam(initialDateRange);
    const category = initialCategory?.trim() || "all";
    const ticker = initialTicker?.trim().toUpperCase() || "";
    const timer = setTimeout(() => setFilters((current) => current.region === region && current.range === range && current.category === category && current.ticker === ticker ? current : { ...current, region, range, category, ticker }), 0);
    return () => clearTimeout(timer);
  }, [initialCategory, initialDateRange, initialRegion, initialTicker]);

  const calendar = useQuery({ queryKey: ["calendar", language], queryFn: ({ signal }) => marketApi.calendar(language, signal), enabled: appActive, staleTime: 600_000 });
  const earnings = useQuery({ queryKey: ["earnings", "composite"], queryFn: ({ signal }) => marketApi.earnings(signal), enabled: appActive, staleTime: 600_000 });
  const merged = useMemo(() => mergeCalendarEvents(calendar.data, earnings.data), [calendar.data, earnings.data]);
  const preferredRegions = useMemo(() => workspace.data.preferences?.preferred_regions ?? [], [workspace.data.preferences?.preferred_regions]);
  const personalSymbols = useMemo(() => [...new Set([...workspace.data.portfolio.map((item) => item.symbol), ...workspace.data.watchlist].map((symbol) => symbol.replace(/\.TO$/i, "").toUpperCase()))], [workspace.data.portfolio, workspace.data.watchlist]);
  const filtered = useMemo(() => filterCalendarItems(merged, filters, now, personalSymbols, preferredRegions), [filters, merged, now, personalSymbols, preferredRegions]);
  const sections = useMemo(() => groupCalendarByTorontoDate(filtered, now, language), [filtered, language, now]);
  const major = useMemo(() => nextMajorEvent(merged, now), [merged, now]);
  const categories = useMemo(() => [...new Set(merged.filter((item) => item.kind === "economic").map((item) => item.category))].sort(), [merged]);
  const sectors = useMemo(() => [...new Set(merged.filter((item) => item.kind === "earnings").map((item) => item.sector).filter((value): value is string => Boolean(value)))].sort(), [merged]);
  const statuses = useMemo(() => uniqueStatuses([...(calendar.data?.source_statuses ?? []), ...(earnings.data?.source_statuses ?? [])]), [calendar.data?.source_statuses, earnings.data?.source_statuses]);
  const anyData = Boolean(calendar.data || earnings.data);
  const stale = Boolean((calendar.data && calendar.isError) || (earnings.data && earnings.isError));
  const refresh = () => { void calendar.refetch(); void earnings.refetch(); };
  const reset = () => setFilters(DEFAULT_FILTERS);
  const open = (item: CalendarIntelligenceItem) => item.kind === "earnings" ? router.push({ pathname: "/focus/[ticker]", params: { ticker: item.ticker } }) : setSelected(item);

  const contentHeader = <>
    {header}
    <ScreenHeader eyebrow={pick("CALENDRIER ÉCONOMIQUE", "ECONOMIC CALENDAR")} title={calendarRangeLabel(filters.range, language)} subtitle={pick("Économie canadienne, provinces et résultats TSX.", "Canadian economy, provinces and TSX earnings.")} />
    {stale ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <QueryState error={!anyData ? (calendar.error instanceof Error ? calendar.error : earnings.error instanceof Error ? earnings.error : null) : null} loading={!anyData && (calendar.isLoading || earnings.isLoading)} onRetry={refresh} />
    {calendar.isError && !calendar.data && earnings.data ? <Text style={styles.partial}>{pick("Le calendrier économique est indisponible; les résultats demeurent accessibles.", "The economic calendar is unavailable; earnings remain available.")}</Text> : null}
    {earnings.isError && !earnings.data && calendar.data ? <Text style={styles.partial}>{pick("Les résultats sont indisponibles; le calendrier économique demeure accessible.", "Earnings are unavailable; the economic calendar remains available.")}</Text> : null}
    {major ? <View style={styles.major} testID="calendar-next-major"><Text style={styles.eyebrow}>{pick("PROCHAIN ÉVÉNEMENT MAJEUR", "NEXT MAJOR EVENT")}</Text><Text style={styles.majorTitle}>{major.title}</Text><Text style={styles.majorMeta}>{new Date(major.startsAt).toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto", timeZoneName: "short" })} · {countdownLabel(major.startsAt, now, language)}</Text></View> : null}
    <CalendarFilters categories={categories} filters={filters} hasPersonal={personalSymbols.length > 0} onChange={setFilters} preferredRegions={preferredRegions} sectors={sectors} />
  </>;
  return <SafeAreaView edges={["top"]} style={styles.safe} testID="calendar-intelligence-screen"><CalendarTimeline footer={<CalendarSourceHealth statuses={statuses} />} header={contentHeader} onOpen={open} onRefresh={refresh} onReset={reset} refreshing={calendar.isRefetching || earnings.isRefetching} sections={sections} /><CalendarEventModal item={selected} onClose={() => setSelected(null)} /></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, stale: { ...typography.caption, color: colors.warning, fontWeight: "800" }, partial: { ...typography.caption, color: colors.textMuted }, major: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, eyebrow: { ...typography.label, color: colors.primary, letterSpacing: 1 }, majorTitle: { ...typography.section, color: colors.text }, majorMeta: { ...typography.body, color: colors.textMuted } });
