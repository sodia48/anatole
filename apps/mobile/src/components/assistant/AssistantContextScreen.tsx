import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Field, Screen, ScreenHeader } from "@/src/components/ui";
import { workspaceApi, type MobileAssistantContext, type MobileUnifiedAssistantResponse } from "@/src/lib/api/workspace";
import type { PortfolioPositionInput } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { assistantIsGrounded, containsRecommendation, containsUnsupportedCausality } from "./grounding";
import { mobileAssistantHref } from "./routes";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

const prompts = [
  ["Pourquoi ce titre bouge aujourd’hui ?", "Why is this security moving today?"],
  ["Explique-moi le risque de mon portefeuille.", "Explain my portfolio risk."],
  ["Compare RY et TD.", "Compare RY and TD."],
  ["Que se passe-t-il sur le marché canadien ?", "What is happening in the Canadian market?"],
] as const;

export function AssistantContextScreen() {
  useMobileTheme();
  const { symbol, surface } = useLocalSearchParams<{ symbol?: string; surface?: string }>();
  const { workspace } = useMobileAccount();
  const { pick, language } = useLocale();
  const cleanSymbol = typeof symbol === "string" && /^[A-Za-z0-9.^-]{1,15}$/.test(symbol) ? symbol.toUpperCase().replace(/\.TO$/, "") : undefined;
  const selectedSurface: MobileAssistantContext["surface"] = surface === "portfolio" ? "portfolio" : surface === "etf" ? "etf" : cleanSymbol ? "stock" : "other";
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<MobileUnifiedAssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [authorized, setAuthorized] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function ask(text: string, consent = authorized, positions: PortfolioPositionInput[] = []) {
    if (!text.trim()) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError(null);
    const context: MobileAssistantContext = {
      surface: selectedSurface,
      route: cleanSymbol ? selectedSurface === "etf" ? `/etf/${cleanSymbol}` : `/focus/${cleanSymbol}` : selectedSurface === "portfolio" ? "/portefeuille" : "/assistant",
      symbol: cleanSymbol,
      symbols: cleanSymbol ? [cleanSymbol] : [],
      instrument_type: selectedSurface === "etf" ? "etf" : cleanSymbol ? "stock" : "unknown",
      portfolio_scope: { authorized: consent, position_count: positions.length },
      language,
    };
    try {
      const next = await workspaceApi.assistantUnified(text, context, conversationId, consent && positions.length > 0, positions, controller.current.signal);
      setConversationId(next.conversation_id);
      if (next.permission_required) {
        setAuthorized(false);
        setPendingPermission(text);
        setResponse(null);
      } else {
        if (!assistantIsGrounded(next) || containsUnsupportedCausality(next.answer) || (!next.guardrail_triggered && containsRecommendation(next.answer))) {
          throw new Error(pick("Réponse non conforme aux garde-fous.", "Response failed grounding guardrails."));
        }
        setPendingPermission(null);
        setResponse(next);
      }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : pick("Assistant indisponible.", "Assistant unavailable."));
    } finally { setLoading(false); }
  }

  function approve() {
    const positions = workspace.data.portfolio;
    if (!pendingPermission || !positions.length) { setError(pick("Aucune position disponible.", "No positions available.")); return; }
    setAuthorized(true);
    void ask(pendingPermission, true, positions);
  }

  function decline() {
    setAuthorized(false);
    setPendingPermission(null);
    setResponse(null);
    setError(pick("Sans autorisation, je peux expliquer les risques généraux, pas analyser vos positions.", "Without permission, I can explain general risks but cannot analyze your positions."));
  }

  return <Screen testID="assistant-screen">
    <ScreenHeader eyebrow="EVIDENCE BUNDLE" title="Anatole Assistant" subtitle={pick("Analyses sourcées des données Anatole.", "Sourced analysis of Anatole data.")} />
    {cleanSymbol ? <Text style={styles.chip}>{selectedSurface === "etf" ? "ETF" : "Focus"} · {cleanSymbol}</Text> : null}
    <View style={styles.prompts}>{prompts.map(([fr, en]) => <Pressable key={fr} onPress={() => setMessage(pick(fr, en))} style={styles.prompt}><Text style={styles.promptText}>{pick(fr, en)}</Text></Pressable>)}</View>
    <Field label={pick("Question", "Question")} multiline onChangeText={setMessage} value={message} />
    <Button disabled={!message.trim() || loading} label={loading ? pick("Analyse…", "Analyzing…") : pick("Interroger Anatole", "Ask Anatole")} onPress={() => void ask(message, authorized, authorized && (selectedSurface === "portfolio" && /risqu|secteur|concentr|performance|nouvell|positions/i.test(message) || /portefeuille|positions|allocation|chevauch|overlap|(?:mon|mes|my).{0,30}risqu|my portfolio|my risk/i.test(message)) ? workspace.data.portfolio : [])} />
    {pendingPermission ? <Card title={pick("Autorisation du portefeuille", "Portfolio permission")}><Text style={styles.answer}>{pick("Autoriser Anatole Assistant à analyser les positions de ce portefeuille pour cette conversation ?", "Allow Anatole Assistant to analyze this portfolio's positions for this conversation?")}</Text><Button label={pick("Autoriser pour cette conversation", "Allow for this conversation")} onPress={approve} /><Button label={pick("Pas maintenant", "Not now")} onPress={decline} /></Card> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {response ? <Card title={response.title}><Text style={styles.answer}>{response.answer.replaceAll("**", "")}</Text>
      {response.facts.map((item) => <Text key={item.label} style={styles.fact}>{item.label} · {item.value}</Text>)}
      {response.actions.map((action) => { const href = mobileAssistantHref(action.href); return href ? <Pressable accessibilityRole="link" key={`${action.label}-${action.href}`} onPress={() => router.push(href as never)} style={styles.link}><Text style={styles.linkText}>{action.label} →</Text></Pressable> : null; })}
      <Text style={styles.sourceTitle}>{pick("Sources et données utilisées", "Sources and data used")} · {new Date(response.generated_at).toLocaleString()}</Text>
      {response.sources.length ? response.sources.map((source) => <Text key={`${source.label}-${source.detail}`} style={styles.source}>{source.label} · {source.detail}</Text>) : <Text style={styles.source}>N/D</Text>}
      <Text style={styles.disclaimer}>{response.disclaimer}</Text>
    </Card> : null}
  </Screen>;
}

const styles = createThemedStyles((colors) => ({
  prompts: { gap: spacing.xs }, prompt: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  promptText: { ...typography.caption, color: colors.primary }, chip: { ...typography.caption, color: colors.primary },
  error: { ...typography.body, color: colors.negative }, answer: { ...typography.body, color: colors.text }, fact: { ...typography.caption, color: colors.textMuted },
  link: { minHeight: 44, justifyContent: "center" }, linkText: { ...typography.body, color: colors.primary, fontWeight: "800" },
  sourceTitle: { ...typography.label, color: colors.primary, marginTop: spacing.sm }, source: { ...typography.caption, color: colors.textMuted }, disclaimer: { ...typography.caption, color: colors.textSubtle },
}));
