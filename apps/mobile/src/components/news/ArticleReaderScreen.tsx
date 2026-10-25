import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { NewsThumbnail } from "@/src/components/news/NewsThumbnail";
import { isExternalScheme, parseArticleParams, safeWebUrl } from "@/src/lib/article";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { marketApi } from "@/src/lib/api/market";
import type { NewsBriefResponse } from "@/src/lib/api/types";

export function ArticleReaderScreen() {
  useMobileTheme();
  const rawParams = useLocalSearchParams();
  const { language, pick } = useLocale();
  const article = useMemo(() => parseArticleParams(rawParams), [rawParams]);
  const [loading, setLoading] = useState(Boolean(article));
  const [webFailed, setWebFailed] = useState(false);
  const [brief, setBrief] = useState<NewsBriefResponse | null>(null);
  const [briefLoading, setBriefLoading] = useState(Boolean(article));
  const [briefFailed, setBriefFailed] = useState(false);
  const [briefAttempt, setBriefAttempt] = useState(0);
  const [detailed, setDetailed] = useState(false);
  const [showAllFigures, setShowAllFigures] = useState(false);
  const [evidenceKey, setEvidenceKey] = useState<string | null>(null);
  const published = article?.publishedAt ? new Date(article.publishedAt) : null;
  const date = published && !Number.isNaN(published.getTime())
    ? published.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long", timeStyle: "short" })
    : "N/D";

  useEffect(() => {
    if (!article) return;
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setBrief(null);
      setBriefLoading(true);
      setBriefFailed(false);
      setShowAllFigures(false);
      setEvidenceKey(null);
    });
    void marketApi.newsBrief({
      title: article.title, summary: article.summary, url: article.url,
      source: article.source, category: article.category, region: article.region,
      context: article.context, ticker: article.ticker || undefined,
      related_tickers: article.relatedTickers ? article.relatedTickers.split(",") : [],
      published_at: article.publishedAt || undefined, language,
    }, controller.signal).then((value) => {
      if (active) setBrief(value);
    }).catch((reason: unknown) => {
      if (active && !(reason instanceof Error && reason.name === "AbortError")) setBriefFailed(true);
    }).finally(() => { if (active) setBriefLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [article, language, briefAttempt]);

  const openExternally = () => {
    if (article) void Linking.openURL(article.url).catch(() => undefined);
  };
  const share = () => {
    if (!article) return;
    void Share.share({
      title: article.title,
      message: `${article.title}\n${article.url}`,
      url: article.url,
    });
  };

  return <SafeAreaView edges={["top", "bottom"]} style={styles.safe} testID="article-reader-screen">
    <View style={styles.topbar}>
      <Pressable accessibilityLabel={pick("Retour", "Back")} accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton} testID="article-back"><Text style={styles.icon}>‹</Text></Pressable>
      <Text numberOfLines={1} style={styles.publisher}>{article?.source || "Anatole"}</Text>
      <Pressable accessibilityLabel={pick("Partager", "Share")} accessibilityRole="button" disabled={!article} onPress={share} style={styles.actionButton} testID="article-share"><Text style={styles.actionText}>{pick("Partager", "Share")}</Text></Pressable>
    </View>

    {!article ? <View accessibilityRole="alert" style={styles.invalid} testID="article-invalid-url">
      <Text style={styles.invalidTitle}>{pick("Lien d’article invalide", "Invalid article link")}</Text>
      <Text style={styles.invalidCopy}>{pick("Anatole a refusé d’ouvrir cette adresse.", "Anatole refused to open this address.")}</Text>
    </View> : <>
      <ScrollView style={styles.storyHeader} contentContainerStyle={styles.storyContent} testID="article-story">
        <Text style={styles.sectionLabel}>{pick("ARTICLE", "ARTICLE")}</Text>
        <Text style={styles.source}>{article.source || pick("Actualité", "News")} · {date}</Text>
        <Text style={styles.title}>{article.title || pick("Article", "Article")}</Text>
        {article.imageUrl ? <NewsThumbnail imageUrl={article.imageUrl} size="hero" source={article.source || "Anatole"} testID="article-hero" /> : null}
        {brief?.availability === "limited" ? <Text style={styles.summary}>{pick("Seuls le titre et la source sont disponibles. Ouvrez l’article original pour en savoir plus.", "Only the title and source are available. Open the original article for details.")}</Text> : <View style={styles.summaryBlock} testID="article-summary">
          <Text style={styles.summaryLabel}>{briefFailed
            ? pick("Extrait de la source", "Source excerpt")
            : brief?.translation_status === "unavailable"
              ? pick("Résumé en langue originale", "Summary in original language")
              : pick("Résumé", "Summary")}</Text>
          {briefLoading ? <ActivityIndicator color={colors.primary} accessibilityLabel={pick("Préparation du résumé", "Preparing the brief")} /> : null}
          {!briefLoading ? <Text style={styles.summary}>{brief?.summary || article.summary || pick("Seuls le titre et la source sont disponibles.", "Only the title and source are available.")}</Text> : null}
          {briefFailed ? <Pressable accessibilityRole="button" onPress={() => setBriefAttempt((value) => value + 1)} testID="article-brief-retry"><Text style={styles.actionText}>{pick("Réessayer", "Retry")}</Text></Pressable> : null}
        </View>}
        {brief ? <>
          {brief.detail_available ? <View style={styles.modeRow}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: !detailed }} onPress={() => setDetailed(false)}><Text style={styles.actionText}>{pick("Résumé rapide", "Quick summary")}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: detailed }} onPress={() => setDetailed(true)}><Text style={styles.actionText}>{pick("Analyse détaillée", "Detailed analysis")}</Text></Pressable>
          </View> : null}
          {detailed ? <>
            {brief.key_figures.length || brief.figure_series?.length ? <View style={styles.briefSection}>
              <Text style={styles.summaryLabel}>{pick("Chiffres importants", "Important figures")}</Text>
              {brief.figure_series?.map((group, index) => <View key={index} style={styles.figureBlock}>
                <Text style={styles.summaryLabel}>{group.label}</Text>
                {group.figures.map((figure, row) => <Text key={row} style={styles.summary}>{figure.period ? `${figure.period} · ` : ""}{figure.value}</Text>)}
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: evidenceKey === `series-${index}` }} onPress={() => setEvidenceKey(evidenceKey === `series-${index}` ? null : `series-${index}`)}><Text style={styles.actionText}>{pick("Justification", "Source evidence")}</Text></Pressable>
                {evidenceKey === `series-${index}` ? <Text style={styles.summary}>{group.figures[0]?.context}</Text> : null}
              </View>)}
              {(showAllFigures ? brief.key_figures : brief.key_figures.slice(0, 3)).map((figure, index) => <View key={index} style={styles.figureBlock}>
                <Text style={styles.summaryLabel}>{figure.label || pick("Donnée publiée", "Published figure")}</Text>
                <Text style={styles.summary}>{figure.value}{figure.period ? ` · ${figure.period}` : ""}</Text>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: evidenceKey === `figure-${index}` }} onPress={() => setEvidenceKey(evidenceKey === `figure-${index}` ? null : `figure-${index}`)}><Text style={styles.actionText}>{pick("Justification", "Source evidence")}</Text></Pressable>
                {evidenceKey === `figure-${index}` ? <Text style={styles.summary}>{figure.context}</Text> : null}
              </View>)}
              {brief.key_figures.length > 3 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAllFigures }} onPress={() => setShowAllFigures(!showAllFigures)}><Text style={styles.actionText}>{showAllFigures ? pick("Masquer les détails", "Hide details") : pick("Voir les détails", "See details")}</Text></Pressable> : null}
            </View> : null}
            {brief.changes.length ? <View style={styles.briefSection}><Text style={styles.summaryLabel}>{pick("Ce qui change", "What changed")}</Text>{brief.changes.map((change, index) => <Text key={index} style={styles.summary}>{change}</Text>)}</View> : null}
            {brief.why_it_matters ? <View style={styles.briefSection}><Text style={styles.summaryLabel}>{pick("Ce que cela signifie", "What this means")}</Text><Text style={styles.summary}>{brief.why_it_matters}</Text></View> : null}
            {brief.watch.length ? <View style={styles.briefSection}><Text style={styles.summaryLabel}>{pick("À surveiller", "What to watch")}</Text>{brief.watch.map((item, index) => <Text key={index} style={styles.summary}>{item}</Text>)}</View> : null}
          </> : null}
          {brief.availability !== "limited" ? <View style={styles.briefSection}><Text style={styles.summaryLabel}>{brief.availability === "article" ? pick("Article consulté", "Article consulted") : pick("Résumé de l’éditeur", "Publisher excerpt")}</Text><Text style={styles.summary}>{brief.source_note}</Text></View> : null}
        </> : null}
        <Pressable accessibilityRole="link" onPress={openExternally} style={styles.externalButton} testID="article-view-original"><Text style={styles.externalText}>{pick("Voir la source originale", "View original source")}</Text></Pressable>
      </ScrollView>

      <View style={styles.browser}>
        <View style={styles.sourceBar}><Text style={styles.sourceBarText}>{pick("Source originale", "Original source")}</Text></View>
        {webFailed ? <View accessibilityRole="alert" style={styles.webFallback} testID="article-webview-error">
          <Text style={styles.invalidTitle}>{pick("La page de l’éditeur ne peut pas être affichée ici.", "The publisher page cannot be displayed here.")}</Text>
          <Text style={styles.invalidCopy}>{pick("Poursuivez la lecture sur le site de la source.", "Continue reading on the publisher’s website.")}</Text>
          <Pressable accessibilityRole="link" onPress={openExternally} style={styles.externalButton} testID="article-open-browser"><Text style={styles.externalText}>{pick("Lire la suite sur le site de la source", "Continue reading on the publisher’s website")}</Text></Pressable>
        </View> : <>
          <WebView
            allowsBackForwardNavigationGestures
            javaScriptCanOpenWindowsAutomatically={false}
            onError={() => { setLoading(false); setWebFailed(true); }}
            onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 400) { setLoading(false); setWebFailed(true); } }}
            onLoadEnd={() => setLoading(false)}
            onLoadStart={() => setLoading(true)}
            onShouldStartLoadWithRequest={(request) => {
              if (safeWebUrl(request.url)) return true;
              if (isExternalScheme(request.url)) void Linking.openURL(request.url).catch(() => undefined);
              return false;
            }}
            originWhitelist={["http://*", "https://*"]}
            setSupportMultipleWindows={false}
            source={{ uri: article.url }}
            style={styles.webview}
            testID="article-webview"
          />
          {loading ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>{pick("Chargement de la page originale…", "Loading original page…")}</Text></View> : null}
        </>}
      </View>
    </>}
  </SafeAreaView>;
}

const styles = createThemedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  topbar: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  icon: { color: colors.text, fontSize: 34, lineHeight: 38 },
  publisher: { ...typography.label, flex: 1, color: colors.text, textAlign: "center" },
  actionButton: { minWidth: 72, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  actionText: { ...typography.label, color: colors.primary },
  storyHeader: { maxHeight: "58%", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.background },
  storyContent: { gap: spacing.sm, padding: spacing.lg },
  sectionLabel: { ...typography.caption, color: colors.primary, fontWeight: "800", letterSpacing: 1.2 },
  source: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  summaryBlock: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  summaryLabel: { ...typography.label, color: colors.text },
  summary: { ...typography.body, color: colors.textMuted },
  modeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm, paddingVertical: spacing.sm },
  briefSection: { gap: spacing.xs, paddingVertical: spacing.sm },
  figureBlock: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  browser: { flex: 1, minHeight: 180, overflow: "hidden", backgroundColor: "#ffffff" },
  sourceBar: { minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  sourceBarText: { ...typography.caption, color: colors.textMuted, fontWeight: "800" },
  webview: { flex: 1, backgroundColor: "#ffffff" },
  loading: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surface },
  loadingText: { ...typography.caption, color: colors.textMuted },
  invalid: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  invalidTitle: { ...typography.section, color: colors.text, textAlign: "center" },
  invalidCopy: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  externalButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary },
  externalText: { ...typography.label, color: colors.onPrimary },
}));
