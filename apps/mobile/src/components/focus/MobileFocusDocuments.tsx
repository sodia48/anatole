import { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import type { DocumentPassage, FundamentalDocumentResearch } from "@anatole/shared/fundamental-documents";
import { Card, QueryState } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";

const topics: Record<string, [string, string]> = {
  results: ["Résultats", "Results"], cash_flow: ["Flux de trésorerie", "Cash flow"], capital: ["Capital", "Capital"],
  accounting: ["Méthodes comptables et retraitements", "Accounting and restatements"],
  outlook: ["Perspectives publiées", "Published outlook"], query: ["Recherche", "Search"],
};
const metricLabels: Record<string, [string, string]> = {
  total_revenue: ["Revenus", "Revenue"], net_income: ["Bénéfice net", "Net income"],
  operating_cash_flow: ["Flux opérationnel", "Operating cash flow"], free_cash_flow: ["Flux disponible", "Free cash flow"],
  total_debt: ["Dette totale", "Total debt"],
};

function Passage({ passage }: { passage: DocumentPassage }) {
  const { pick } = useLocale();
  return <View style={styles.passage}><Text style={styles.label}>{pick(...(topics[passage.topic] ?? [passage.topic, passage.topic]))}</Text>
    <Text style={styles.body}>{passage.excerpt}</Text>
    {passage.document_url.startsWith("https://") ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(passage.page_number === null ? passage.document_url : `${passage.document_url}#page=${passage.page_number}`)}>
      <Text style={styles.link}>{passage.document_title}{passage.page_number === null ? "" : ` · ${pick("page", "page")} ${passage.page_number}`}
        {passage.published_at ? ` · ${passage.published_at.slice(0, 10)}` : ""}</Text></Pressable>
      : <Text style={styles.note}>{passage.document_title}</Text>}
  </View>;
}

export function MobileFocusDocuments({ research, loading, error, onRetry, onSearch }: {
  research?: FundamentalDocumentResearch; loading: boolean; error: Error | null; onRetry: () => void;
  onSearch: (query: string) => void;
}) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [draft, setDraft] = useState("");
  const [showLimits, setShowLimits] = useState(false);
  return <View style={styles.stack} testID="focus-documents-section">
    <QueryState error={!research ? error : null} loading={loading} onRetry={onRetry} />
    <Card title={pick("Rapports et provenance", "Reports and provenance")}>
      <Text style={styles.note}>{pick("Extraits littéraux de documents de l’émetteur; page indiquée seulement si vérifiable dans le PDF.",
        "Literal issuer-document excerpts; pages shown only when verifiable in the PDF.")}</Text>
      <TextInput accessibilityLabel={pick("Rechercher un terme ou une expression", "Search for a term or phrase")}
        value={draft} onChangeText={setDraft} maxLength={120} style={styles.input} />
      <Pressable accessibilityRole="button" onPress={() => { if (!draft.trim() || draft.trim().length >= 2) onSearch(draft.trim()); }} style={styles.action}>
        <Text style={styles.actionText}>{pick("Rechercher", "Search")}</Text></Pressable>
    </Card>
    {research ? <>
      {research.source_stale ? <Text style={styles.note}>{pick("Instantané financier périmé : vérifiez les dates.", "Stale financial snapshot: check dates.")}</Text> : null}
      {research.reported_observations.length ? <Card title={pick("Chiffres officiels déjà extraits", "Previously extracted official figures")}>
        <Text style={styles.note}>{pick("Valeurs du moteur financier; aucune page attribuée sans extrait vérifié.",
          "Values from the financial engine; no page assigned without a verified excerpt.")}</Text>
        {research.reported_observations.map((item, index) => <View key={`${item.metric}-${item.period_end}-${index}`} style={styles.passage}>
          <Text style={styles.label}>{pick(...(metricLabels[item.metric] ?? [item.metric, item.metric]))} · {item.period_end.slice(0, 10)}</Text>
          <Text style={styles.body}>{new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(item.value)} {item.currency}</Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.source_url)}><Text style={styles.link}>{item.source_name}</Text></Pressable>
        </View>)}</Card> : null}
      <Card title={`${pick("Documents analysés", "Documents scanned")} : ${research.documents_scanned}`}>
        {!research.passages.length ? <Text style={styles.note}>{pick("Aucun passage vérifiable disponible.", "No verifiable passage available.")}</Text> : null}
        {research.passages.map((passage, index) => <Passage key={`${passage.document_url}-${passage.page_number}-${index}`} passage={passage} />)}
      </Card>
      {research.comparisons.length ? <Card title={pick("Comparaison des rapports annuels", "Annual-report comparison")}>
        <Text style={styles.note}>{pick("Différence de texte à examiner; importance non déduite automatiquement.",
          "Text difference to review; significance is not inferred automatically.")}</Text>
        {research.comparisons.map(item => <View key={item.topic} style={styles.comparison}><Passage passage={item.current} /><Passage passage={item.previous} /></View>)}
      </Card> : null}
      <Card title={pick("Limites", "Limits")}><Pressable accessibilityRole="button" onPress={() => setShowLimits(!showLimits)}>
        <Text style={styles.link}>{showLimits ? pick("Masquer", "Hide") : pick("Afficher", "Show")}</Text></Pressable>
        {showLimits ? (language === "fr" ? research.limitations_fr : research.limitations_en).map(item => <Text key={item} style={styles.note}>• {item}</Text>) : null}</Card>
    </> : null}
  </View>;
}

const styles = createThemedStyles(colors => ({
  stack: { gap: spacing.md }, passage: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  comparison: { gap: spacing.sm, marginTop: spacing.md },
  label: { ...typography.label, color: colors.text }, body: { ...typography.body, color: colors.text },
  note: { ...typography.caption, color: colors.textMuted }, link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  input: { ...typography.body, color: colors.text, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, marginVertical: spacing.sm },
  action: { minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: radius.sm },
  actionText: { ...typography.label, color: colors.background },
}));
