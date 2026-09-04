import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Button, Card, QueryState, Screen, ScreenHeader, uiStyles } from "@/src/components/ui";
import type { AlertRule, AlertSnapshot } from "@/src/lib/api/types";
import { workspaceApi } from "@/src/lib/api/workspace";
import { useLocale } from "@/src/lib/i18n";
import { pushCapability } from "@/src/lib/push";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { AlertBuilder } from "./AlertBuilder";
import { AlertHistory } from "./AlertHistory";
import { AlertRuleCard } from "./AlertRuleCard";
import { AlertTemplates } from "./AlertTemplates";
import { appendAlertHistory, migrateAlertRule } from "./model";

export function AlertCenterScreen() {
  const { state, workspace, saveWorkspace } = useMobileAccount(); const { pick } = useLocale(); const rules = workspace.data.alerts.map(migrateAlertRule); const [templateSymbol, setTemplateSymbol] = useState(workspace.data.watchlist[0] ?? ""); const [history, setHistory] = useState<AlertSnapshot["items"]>([]);
  const query = useQuery({ queryKey: ["alerts", rules], queryFn: ({ signal }) => workspaceApi.alerts(rules, signal), enabled: rules.length > 0, refetchInterval: 60_000, refetchIntervalInBackground: false });
  useEffect(() => {
    if (!query.data) return;
    const timer = setTimeout(() => setHistory((current) => appendAlertHistory(current, query.data!.items.filter((item) => item.triggered))), 0);
    return () => clearTimeout(timer);
  }, [query.data]);
  const saveRules = (next: AlertRule[]) => saveWorkspace({ ...workspace.data, alerts: next });
  const add = async (rule: AlertRule) => { await saveRules([...rules, rule]); setTemplateSymbol(rule.symbol); };
  const capability = pushCapability();
  return <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching} testID="alerts-screen"><ScreenHeader eyebrow="ALERT CENTER PRO" title={pick("Centre d’alertes", "Alert Center")} subtitle={pick("Seuils et événements sourcés, avec déduplication quotidienne.", "Sourced thresholds and events with daily deduplication.")} />{state !== "authenticated" ? <Card><Text style={uiStyles.muted}>{pick("Mode local. Connectez-vous pour synchroniser.", "Local mode. Sign in to sync.")}</Text><Button label={pick("Se connecter", "Sign in")} onPress={() => router.push("/(auth)/login")} /></Card> : null}<Card><Text style={uiStyles.muted}>{capability.push_supported ? pick("Push natif disponible dans ce build.", "Native push available in this build.") : pick("Expo Go : notifications dans l’application uniquement.", "Expo Go: in-app notifications only.")}</Text></Card><AlertBuilder onAdd={add} /><AlertTemplates onAdd={add} symbol={templateSymbol} /><QueryState error={!query.data ? query.error : null} loading={query.isLoading} onRetry={() => void query.refetch()} /><Card title={`${rules.length} ${pick("règles", "rules")}`}>{rules.length ? rules.map((rule) => <AlertRuleCard evaluation={query.data?.items.find((item) => item.id === rule.id)} key={rule.id} onRemove={() => void saveRules(rules.filter((item) => item.id !== rule.id))} onToggle={(enabled) => void saveRules(rules.map((item) => item.id === rule.id ? { ...item, enabled } : item))} rule={rule} />) : <Text style={uiStyles.muted}>{pick("Aucune alerte.", "No alert.")}</Text>}</Card><AlertHistory items={history} /></Screen>;
}
