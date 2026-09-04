import { Text } from "react-native";
import { Card } from "@/src/components/ui";
import type { AlertSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { uiStyles } from "@/src/components/ui";

export function AlertHistory({ items }: { items: AlertSnapshot["items"] }) { const { pick } = useLocale(); return <Card title={pick("Historique récent", "Recent history")}>{items.length ? items.slice(0, 20).map((item, index) => <Text key={`${item.id}-${index}`} style={uiStyles.muted}>{item.symbol} · {item.message}</Text>) : <Text style={uiStyles.muted}>{pick("Aucun déclenchement enregistré.", "No recorded trigger.")}</Text>}</Card>; }
