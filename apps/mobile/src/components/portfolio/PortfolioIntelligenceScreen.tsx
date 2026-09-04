import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text } from "react-native";

import { Button, Card, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import { GlobalSearchButton } from "@/src/components/search/GlobalSearchButton";
import { workspaceApi } from "@/src/lib/api/workspace";
import type { PortfolioPositionInput } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { PortfolioAllocation } from "./PortfolioAllocation";
import { PortfolioContribution } from "./PortfolioContribution";
import { PortfolioCorrelation } from "./PortfolioCorrelation";
import { PortfolioEditor } from "./PortfolioEditor";
import { PortfolioOverview } from "./PortfolioOverview";
import { PortfolioPerformance } from "./PortfolioPerformance";
import { PortfolioPositions } from "./PortfolioPositions";
import { PortfolioRisk } from "./PortfolioRisk";
import { PortfolioStressTests } from "./PortfolioStressTests";

export function PortfolioIntelligenceScreen() {
  const { state, workspace, saveWorkspace } = useMobileAccount();
  const { pick } = useLocale();
  const queryClient = useQueryClient();
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const positions = workspace.data.portfolio;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const active = next === "active";
      setAppActive(active);
      if (!active) void queryClient.cancelQueries({ queryKey: ["portfolio"] });
    });
    return () => subscription.remove();
  }, [queryClient]);
  const query = useQuery({ queryKey: ["portfolio", positions], queryFn: ({ signal }) => workspaceApi.portfolio(positions, signal), enabled: appActive && positions.length > 0, staleTime: 60_000 });
  const save = async (next: PortfolioPositionInput[]) => saveWorkspace({ ...workspace.data, portfolio: next });
  return <Screen onRefresh={positions.length ? () => void query.refetch() : undefined} refreshing={query.isRefetching} testID="portfolio-screen"><ScreenHeader action={<GlobalSearchButton />} eyebrow={pick("PORTFOLIO INTELLIGENCE", "PORTFOLIO INTELLIGENCE")} title={pick("Portefeuille 2.0", "Portfolio 2.0")} subtitle={pick("Mesures observées, reconstitutions couvertes et scénarios historiques — sans recommandation.", "Observed metrics, coverage-aware reconstructions and historical scenarios — without recommendations.")} />
    {state !== "authenticated" ? <Card><Text style={styles.muted}>{pick("Mode local. Connectez-vous pour synchroniser votre portefeuille.", "Local mode. Sign in to sync your portfolio.")}</Text><Button label={pick("Se connecter", "Sign in")} onPress={() => router.push("/(auth)/login")} /></Card> : null}
    <PortfolioEditor onSave={save} positions={positions} />
    {!positions.length ? <Card><Text style={styles.empty}>{pick("Votre portefeuille est vide. Ajoutez une position pour lancer l’analyse.", "Your portfolio is empty. Add a position to start the analysis.")}</Text></Card> : null}
    <QueryState error={!query.data ? query.error : null} loading={query.isLoading} onRetry={() => void query.refetch()} />
    {query.data && query.isError ? <Text style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    {query.data ? <><PortfolioOverview snapshot={query.data} /><PortfolioPerformance horizons={query.data.performance_horizons} /><PortfolioContribution results={query.data.contribution_horizons} /><PortfolioAllocation currencies={query.data.currency_allocation} sectors={query.data.sector_allocation} /><PortfolioRisk reading={query.data.risk_reading} risk={query.data.risk} /><PortfolioCorrelation correlation={query.data.correlation} /><PortfolioStressTests items={query.data.stress_tests} /><PortfolioPositions onRemove={(symbol) => void save(positions.filter((item) => normalizeSymbol(item.symbol) !== normalizeSymbol(symbol)))} positions={query.data.positions} />{query.data.methodology ? <Text style={styles.methodology}>{query.data.methodology}</Text> : null}</> : null}
  </Screen>;
}

function normalizeSymbol(value: string) { return value.replace(/\.TO$/i, "").toUpperCase(); }
const styles = StyleSheet.create({ muted: { ...typography.body, color: colors.textMuted }, empty: { ...typography.body, color: colors.textMuted, textAlign: "center", padding: spacing.lg }, stale: { ...typography.caption, color: colors.warning, fontWeight: "800" }, methodology: { ...typography.caption, color: colors.textSubtle, paddingBottom: spacing.xl } });
