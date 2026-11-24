import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Card, QueryState, Screen } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { spacing, typography } from "@/src/theme/tokens";

function quarter(value: string | null | undefined): string {
  if (!value) return "N/D";
  return `T${Math.ceil(Number(value.slice(5, 7)) / 3)} ${value.slice(0, 4)}`;
}

function dateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "N/D";
}

export function InstitutionsMobileScreen({ header }: { header: ReactNode }) {
  useMobileTheme();
  const { pick } = useLocale();
  const query = useQuery({
    queryKey: ["institutions", "directory"],
    queryFn: ({ signal }) => marketApi.institutions(signal),
    staleTime: 5 * 60_000,
  });
  const snapshot = query.data;
  const reported = snapshot?.institutions_reporting ?? snapshot?.institutions.length ?? 0;
  const expected = snapshot?.institutions_expected ?? reported;

  return <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching} testID="institutions-mobile-screen">
    {header}
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} />
    {snapshot ? <>
      <Card title={pick("Institutions 13F", "13F institutions")}>
        <Text style={styles.primary}>{pick("Dernier trimestre validé", "Latest validated quarter")} : {quarter(snapshot.report_period)}</Text>
        <Text style={styles.meta}>{reported}/{expected} {pick("gestionnaires vérifiés", "verified managers")}</Text>
        {snapshot.partial_report_period ? <Text style={styles.meta}>{pick("Trimestre en cours de collecte", "Quarter being collected")} : {quarter(snapshot.partial_report_period)} · {snapshot.partial_institutions_reporting ?? 0} {pick("ont publié, autres en attente", "reported, others pending")}</Text> : null}
        <Text style={styles.meta}>{pick("Dernière synchronisation", "Last sync")} : {dateTime(snapshot.last_sync_at)}</Text>
        <Text style={styles.meta}>{pick("Prochain contrôle", "Next check")} : {dateTime(snapshot.next_check_at)}</Text>
        <Text style={styles.meta}>{pick("Source SEC", "SEC source")} : {snapshot.sources[0]?.status ?? "N/D"}</Text>
        {snapshot.collection_error ? <Text style={styles.warning}>{snapshot.collection_error}</Text> : null}
      </Card>
      <Card title={pick("Gestionnaires du trimestre validé", "Managers in the validated quarter")}>
        {snapshot.institutions.map((manager) => <View key={manager.cik} style={styles.manager}>
          <Text style={styles.name}>{manager.name}</Text>
          <Text style={styles.meta}>{quarter(manager.report_period)} · CIK {manager.cik}</Text>
        </View>)}
      </Card>
    </> : null}
  </Screen>;
}

const styles = createThemedStyles((colors) => ({
  primary: { ...typography.label, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  warning: { ...typography.caption, color: colors.negative },
  manager: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { ...typography.label, color: colors.text },
}));
