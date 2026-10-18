import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";
import type { MobileFundamentalView } from "./MobileFocusFundamentalTabs";

const modules = [
  { id: "diagnostic", icon: "radar", fr: "Diagnostic 360°", en: "360° diagnostic", detailFr: "Santé financière et qualité des bénéfices", detailEn: "Financial health and earnings quality" },
  { id: "peers", icon: "compare-horizontal", fr: "Comparateur sectoriel", en: "Sector comparison", detailFr: "Concurrents, ratios et classements", detailEn: "Peers, ratios and rankings" },
  { id: "scenarios", icon: "tune-variant", fr: "Simulateur", en: "Simulator", detailFr: "Hypothèses, scénarios et valorisation", detailEn: "Assumptions, scenarios and valuation" },
  { id: "documents", icon: "file-search-outline", fr: "Analyse documentaire", en: "Document research", detailFr: "Rapports officiels et traçabilité", detailEn: "Official reports and traceability" },
  { id: "sector", icon: "bank-outline", fr: "Intelligence sectorielle", en: "Sector intelligence", detailFr: "Indicateurs propres à chaque industrie", detailEn: "Industry-specific metrics" },
  { id: "alerts", icon: "bell-outline", fr: "Surveillance", en: "Monitoring", detailFr: "Alertes et changements fondamentaux", detailEn: "Alerts and fundamental changes" },
  { id: "capital", icon: "chart-line", fr: "Analystes et capital", en: "Analysts and capital", detailFr: "Révisions, dividendes et investissements", detailEn: "Revisions, dividends and investment" },
  { id: "assistant", icon: "robot-outline", fr: "Assistant financier", en: "Financial assistant", detailFr: "Explications et analyses transversales", detailEn: "Explanations and cross-cutting analysis" },
] as const;

export function MobileFundamentalPortal({ ticker, onOpen }: { ticker: string; onOpen: (view: MobileFundamentalView) => void }) {
  useMobileTheme();
  const { pick } = useLocale();
  return <View style={styles.portal} testID="fundamental-portal">
    <View style={styles.heading}><MaterialCommunityIcons name="brain" size={29} color={styles.icon.color} />
      <View style={styles.headingCopy}><Text style={styles.title}>Anatole Fundamental Intelligence 360</Text>
        <Text style={styles.subtitle}>{pick("Un environnement d’analyse financière entièrement intégré", "A fully integrated financial research environment")}</Text>
        <Text style={styles.ticker}>{ticker}</Text></View></View>
    <View style={styles.grid}>{modules.map(item => <Pressable key={item.id} accessibilityRole="button" testID={`fundamental-portal-${item.id}`}
      accessibilityLabel={pick(item.fr, item.en)} style={styles.module}
      onPress={() => { if (item.id === "alerts") router.push("/alerts"); else if (item.id === "assistant") router.push({ pathname: "/assistant", params: { symbol: ticker, surface: "stock" } }); else onOpen(item.id === "sector" ? "diagnostic" : item.id); }}>
      <MaterialCommunityIcons name={item.icon} size={24} color={styles.icon.color} />
      <Text style={styles.moduleTitle}>{pick(item.fr, item.en)}</Text>
      <Text style={styles.moduleDetail}>{pick(item.detailFr, item.detailEn)}</Text>
    </Pressable>)}</View>
    <Text style={styles.footer}>{pick("Sources, périodes et méthodes visibles dans chaque module. Aucun conseil d’investissement.", "Sources, periods and methods are visible in each module. No investment advice.")}</Text>
  </View>;
}

const styles = createThemedStyles(colors => ({
  portal: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.lg },
  heading: { flexDirection: "row", gap: spacing.md }, headingCopy: { flex: 1, gap: spacing.xs },
  icon: { color: colors.primary }, title: { ...typography.title, color: colors.text }, subtitle: { ...typography.caption, color: colors.textMuted },
  ticker: { ...typography.label, color: colors.primary }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  module: { width: "48%", minHeight: 142, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, gap: spacing.xs },
  moduleTitle: { ...typography.label, color: colors.text }, moduleDetail: { ...typography.caption, color: colors.textMuted },
  footer: { ...typography.caption, color: colors.textSubtle, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
}));
