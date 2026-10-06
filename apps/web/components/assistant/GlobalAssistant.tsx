"use client";

import Link from "next/link";
import { Bot, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { askUnifiedAssistant } from "@/lib/api";
import { readAssistantPortfolio, type AssistantContext, type UnifiedAssistantResponse } from "@/lib/assistant-context";
import { useAssistantContext } from "./AssistantContextProvider";
import styles from "./GlobalAssistant.module.css";

type Turn = { role: "user" | "assistant"; text: string; result?: UnifiedAssistantResponse };
const PORTFOLIO_CUE = /portefeuille|positions|allocation|concentration|chevauch|overlap|(?:mon|mes|my).{0,30}risqu|my portfolio|my positions|my risk/i;
const EXPLICIT_SWITCH = /gouvernement|province|canada 360|qu[eé]bec|ontario|alberta|passeport|statistique|march[eé]|market|terminal|actualit[eé]|news|\b(?:SHOP|XIC|LSPD)\b|\b(?:analyse|cours|prix|compare)\b/i;
const SKILL_LABELS: Record<string, string> = { canada360: "Canada 360", portfolio_analysis: "Portefeuille", stock_analysis: "Focus", etf_analysis: "ETF", compare: "Comparateur", market_analysis: "Marché", news_context: "Actualités", data_quality: "Qualité des données" };
const SAFE_HREF = /^\/(?:focus\/[A-Z0-9.^-]{1,15}|etf(?:\/[A-Z0-9.^-]{1,15})?|portefeuille|comparateur(?:\?symbols=[A-Z0-9.^,-]{1,80})?|actualites|canada|terminal|screener|assistant|qualite)$/;

export function GlobalAssistant() {
  const { context, label } = useAssistantContext();
  const [open, setOpen] = useState(false);
  const [removedForRoute, setRemovedForRoute] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [authorized, setAuthorized] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const activeContext: AssistantContext = removedForRoute === context.route
    ? { ...context, surface: "other", route: "", symbol: undefined, symbols: [], instrument_type: "unknown" }
    : context;

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, loading, pendingPermission]);

  async function submit(text: string, consent = authorized, positions?: ReturnType<typeof readAssistantPortfolio>, resume = false) {
    if (!text.trim() || loading) return;
    const lastSkill = [...turns].reverse().find((turn) => turn.result)?.result?.intent;
    const needsPortfolio = PORTFOLIO_CUE.test(text) ||
      !EXPLICIT_SWITCH.test(text) && (lastSkill === "portfolio_analysis" || activeContext.surface === "portfolio");
    const selectedPositions = positions ?? (consent && needsPortfolio ? readAssistantPortfolio() : []);
    setLoading(true);
    setError(null);
    setPendingPermission(null);
    if (!resume) setTurns((current) => [...current, { role: "user", text }]);
    try {
      const result = await askUnifiedAssistant({ message: text, context: {
        ...activeContext, portfolio_scope: { authorized: consent, position_count: consent ? selectedPositions.length : 0 },
      }, conversation_id: conversationId, portfolio_consent: consent && selectedPositions.length > 0,
      portfolio_positions: selectedPositions });
      setConversationId(result.conversation_id);
      if (result.permission_required) { setAuthorized(false); setPendingPermission(text); }
      else setTurns((current) => [...current, { role: "assistant", text: result.answer, result }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assistant indisponible.");
    } finally { setLoading(false); }
  }

  async function allowPortfolio() {
    const text = pendingPermission;
    if (!text) return;
    const positions = readAssistantPortfolio();
    if (!positions.length) { setPendingPermission(null); setError("Aucune position locale valide à analyser."); return; }
    setAuthorized(true);
    await submit(text, true, positions, true);
  }

  function declinePortfolio() {
    setAuthorized(false);
    setPendingPermission(null);
    setTurns((current) => [...current, { role: "assistant", text: "Sans accès aux positions, je peux expliquer les risques généraux, mais pas ceux de votre portefeuille." }]);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    void submit(text);
  }

  return <>
    <button type="button" className={styles.launcher} onClick={() => setOpen(true)} aria-label="Ouvrir Anatole Assistant">
      <Bot size={19} aria-hidden="true" /><span>Anatole Assistant</span>
    </button>
    {open && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.drawer} role="dialog" aria-modal="true" aria-label="Anatole Assistant">
        <header className={styles.header}><div><strong>Anatole Assistant</strong><small>Ask → Analyze → Navigate</small></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer l’assistant"><X size={20} /></button></header>
        <div className={styles.toolbar}>
          {removedForRoute !== context.route && context.surface !== "other" && <span className={styles.chip}>{label}<button type="button" onClick={() => setRemovedForRoute(context.route)} aria-label="Retirer le contexte"><X size={14} /></button></span>}
          <button type="button" className={styles.reset} onClick={() => { setTurns([]); setConversationId(undefined); setAuthorized(false); setPendingPermission(null); }}>Nouvelle conversation</button>
        </div>
        <div className={styles.history} aria-live="polite">
          {turns.length === 0 && <p className={styles.intro}>Posez une question sur cette page, un titre, un ETF, votre portefeuille ou Canada 360.</p>}
          {turns.map((turn, index) => <article key={index} className={turn.role === "user" ? styles.userTurn : styles.assistantTurn}>
            {turn.result && <span className={styles.skillChip}>{SKILL_LABELS[turn.result.intent] ?? turn.result.intent}</span>}
            <p>{turn.text}</p>
            {turn.result?.evidence.some((row) => row.sources.length > 0) && <details><summary>Sources et données utilisées</summary>
              {turn.result.evidence.flatMap((row) => row.sources).map((source, i) => <p key={`${source.label}-${i}`} className={styles.source}>{source.label} · {source.freshness}{source.timestamp ? ` · ${new Date(source.timestamp).toLocaleDateString("fr-CA")}` : ""}</p>)}
              {turn.result.evidence.flatMap((row) => row.missing_data).map((missing, i) => <p key={`missing-${i}`} className={styles.source}>Donnée manquante · {missing}</p>)}
            </details>}
            {turn.result?.actions.filter((action) => SAFE_HREF.test(action.href)).map((action) => <Link className={styles.action} key={action.href} href={action.href} onClick={() => setOpen(false)}>{action.label} →</Link>)}
          </article>)}
          {loading && <p className={styles.pending}>Anatole analyse les données…</p>}
          {pendingPermission && <div className={styles.permission}>
            <strong>Autoriser Anatole Assistant à analyser les positions de ce portefeuille pour cette conversation ?</strong>
            <div><button type="button" onClick={() => void allowPortfolio()}>Autoriser pour cette conversation</button><button type="button" onClick={declinePortfolio}>Pas maintenant</button></div>
          </div>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div ref={bottom} />
        </div>
        <form className={styles.composer} onSubmit={onSubmit}><label htmlFor="global-assistant-question">Votre question</label>
          <div><textarea id="global-assistant-question" value={message} maxLength={1200} onChange={(event) => setMessage(event.target.value)} placeholder="Analyse ce titre…" rows={2} />
            <button type="submit" disabled={loading || !message.trim()} aria-label="Envoyer la question"><Send size={18} /></button></div>
        </form>
      </section>
    </div>}
  </>;
}
