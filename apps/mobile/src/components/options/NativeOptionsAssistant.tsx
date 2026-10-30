import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

import { Button, Card, Field } from "@/src/components/ui";
import { assistantIsGrounded, containsRecommendation, containsUnsupportedCausality } from "@/src/components/assistant/grounding";
import { workspaceApi, type MobileAssistantContext, type MobileUnifiedAssistantResponse } from "@/src/lib/api/workspace";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { typography } from "@/src/theme/tokens";

type ChainContext = { symbol: string; expiration: string; revision: number };
type DisplayAnswer = { response: MobileUnifiedAssistantResponse; chain: ChainContext | null };

export function NativeOptionsAssistant({ symbol, expiration, canUseChain, revision }: {
  symbol: string; expiration: string; canUseChain: boolean; revision: number;
}) {
  useMobileTheme();
  const { pick, language } = useLocale();
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState<ChainContext | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<DisplayAnswer | null>(null);
  const [conversation, setConversation] = useState<string>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const selected = chain && canUseChain && chain.revision === revision && chain.symbol === symbol && chain.expiration === expiration ? chain : null;

  async function ask() {
    if (!question.trim() || pending) return;
    const active = selected;
    const currentController = new AbortController();
    controller.current = currentController;
    const context: MobileAssistantContext = {
      surface: "options", route: "/options", language: language === "en" ? "en" : "fr",
      symbol: active?.symbol, symbols: active ? [active.symbol] : [], instrument_type: "unknown",
      portfolio_scope: { authorized: false, position_count: 0 },
      metadata: active ? { options_market: "tsx", options_expiration: active.expiration } : {},
    };
    setPending(true);
    setError("");
    setAnswer(null);
    try {
      const result = await workspaceApi.assistantUnified(question, context, conversation, false, [], currentController.signal);
      if (currentController.signal.aborted) return;
      if (result.permission_required) {
        setAnswer(null);
        setError(pick("Depuis Options, les positions ne sont pas transmises. Ouvrez Portefeuille pour les analyser.",
          "From Options, positions are not sent. Open Portfolio to analyze them."));
        return;
      }
      const deterministicOptions = result.intent === "options_education" && result.synthesis_provider === null;
      if ((!deterministicOptions && !assistantIsGrounded(result)) || containsUnsupportedCausality(result.answer) ||
          (!result.guardrail_triggered && containsRecommendation(result.answer))) {
        throw new Error("guardrail");
      }
      setConversation(result.conversation_id);
      setAnswer({ response: result, chain: active });
    } catch {
      if (!currentController.signal.aborted) setError(pick("La réponse est indisponible ou ne satisfait pas les garde-fous.",
        "The response is unavailable or did not pass the safeguards."));
    } finally {
      if (!currentController.signal.aborted) setPending(false);
    }
  }

  return <Card title={pick("Assistant Options", "Options assistant")}>
    <Button label={open ? pick("Masquer l'assistant", "Hide assistant") : pick("Ouvrir l'assistant Options", "Open Options assistant")}
      variant="secondary" onPress={() => setOpen((value) => !value)} />
    {open ? <>
      <Text style={styles.copy}>{pick("La question est envoyée à Anatole. Les positions et scénarios ne sont pas ajoutés automatiquement ; ne les saisissez pas dans la question si vous ne souhaitez pas les transmettre.",
        "Your question is sent to Anatole. Positions and scenarios are not attached automatically; do not type them into the question if you do not want to send them.")}</Text>
      {canUseChain ? <Button disabled={pending} variant="secondary" label={selected
        ? pick("Retirer le contexte de chaîne", "Remove chain context")
        : pick(`Ajouter la chaîne ${symbol} au contexte`, `Add the ${symbol} chain to context`)}
        onPress={() => setChain(selected ? null : { symbol, expiration, revision })} /> : null}
      {selected ? <Text style={styles.copy}>{pick("Chaîne sélectionnée", "Selected chain")}: {selected.symbol} · {selected.expiration || pick("toutes les échéances", "all expiries")}</Text> : null}
      <Field label={pick("Votre question Options", "Your Options question")}
        accessibilityLabel={pick("Votre question Options", "Your Options question")} value={question} multiline onChangeText={setQuestion} />
      <Button label={pending ? pick("Analyse…", "Analyzing…") : pick("Interroger Anatole", "Ask Anatole")}
        disabled={pending || !question.trim()} onPress={() => void ask()} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {answer ? <Card title={answer.response.title}>
        {answer.chain ? <Text style={styles.copy}>{pick("Contexte au moment de la question", "Context when asked")}: {answer.chain.symbol} · {answer.chain.expiration || pick("toutes les échéances", "all expiries")}</Text> : null}
        <Text style={styles.answer}>{answer.response.answer.replaceAll("**", "")}</Text>
        {answer.response.sources.map((source, index) => <Text key={index} style={styles.copy}>{source.label} · {source.status} · {source.detail}</Text>)}
        <Text style={styles.copy}>{answer.response.disclaimer}</Text>
      </Card> : null}
    </> : null}
  </Card>;
}

const styles = createThemedStyles((colors) => ({
  copy: { ...typography.body, color: colors.textMuted },
  answer: { ...typography.body, color: colors.text },
  error: { ...typography.body, color: colors.negative },
}));
