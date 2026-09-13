import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { NewsThumbnail } from "@/src/components/news/NewsThumbnail";
import { isExternalScheme, parseArticleParams, safeWebUrl } from "@/src/lib/article";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

export function ArticleReaderScreen() {
  useMobileTheme();
  const rawParams = useLocalSearchParams();
  const { language, pick } = useLocale();
  const article = useMemo(() => parseArticleParams(rawParams), [rawParams]);
  const [loading, setLoading] = useState(Boolean(article));
  const [webFailed, setWebFailed] = useState(false);
  const published = article?.publishedAt ? new Date(article.publishedAt) : null;
  const date = published && !Number.isNaN(published.getTime())
    ? published.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long", timeStyle: "short" })
    : "N/D";

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
      <View style={styles.storyHeader}>
        <Text style={styles.sectionLabel}>{pick("ARTICLE", "ARTICLE")}</Text>
        <Text style={styles.source}>{article.source || pick("Actualité", "News")} · {date}</Text>
        <Text style={styles.title}>{article.title || pick("Article", "Article")}</Text>
        {article.imageUrl ? <NewsThumbnail imageUrl={article.imageUrl} size="hero" source={article.source || "Anatole"} testID="article-hero" /> : null}
        {article.summary ? <View style={styles.summaryBlock}><Text style={styles.summaryLabel}>{pick("Résumé", "Summary")}</Text><Text style={styles.summary}>{article.summary}</Text></View> : null}
        <Pressable accessibilityRole="link" onPress={openExternally} style={styles.externalButton} testID="article-view-original"><Text style={styles.externalText}>{pick("Voir la source originale", "View original source")}</Text></Pressable>
      </View>

      <View style={styles.browser}>
        <View style={styles.sourceBar}><Text style={styles.sourceBarText}>{pick("Source originale", "Original source")}</Text></View>
        {webFailed ? <View accessibilityRole="alert" style={styles.webFallback} testID="article-webview-error">
          <Text style={styles.invalidTitle}>{pick("La page de l’éditeur ne peut pas être affichée ici.", "The publisher page cannot be displayed here.")}</Text>
          <Text style={styles.invalidCopy}>{pick("Contenu complet non disponible. Le titre et le résumé restent disponibles dans Anatole.", "Full article unavailable. The title and summary remain available in Anatole.")}</Text>
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
  storyHeader: { gap: spacing.sm, padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionLabel: { ...typography.caption, color: colors.primary, fontWeight: "800", letterSpacing: 1.2 },
  source: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  summaryBlock: { gap: spacing.xs },
  summaryLabel: { ...typography.label, color: colors.text },
  summary: { ...typography.body, color: colors.textMuted },
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
  externalButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  externalText: { ...typography.label, color: colors.primary },
}));
