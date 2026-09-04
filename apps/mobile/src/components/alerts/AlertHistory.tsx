import { Text } from "react-native";
import { Card, uiStyles } from "@/src/components/ui";
import type { AlertSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";

export function AlertHistory({ items }: { items: AlertSnapshot["items"] }) { const { pick } = useLocale(); return <Card title={pick("Historique récent", "Recent history")}>{items.length ? items.slice(0, 20).map((item, index) => <Text key={`${item.id}-${item.event_fingerprint ?? index}`} style={uiStyles.muted}>{item.symbol} · {item.message}{item.last_triggered_at ? ` · ${pick("Dernier déclenchement", "Last triggered")} ${new Date(item.last_triggered_at).toLocaleString()}` : ""}</Text>) : <Text style={uiStyles.muted}>{pick("Aucun déclenchement enregistré.", "No recorded trigger.")}</Text>}</Card>; }
