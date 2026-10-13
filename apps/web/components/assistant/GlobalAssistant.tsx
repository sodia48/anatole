"use client";

import Link from "next/link";
import { Bot, Send, X } from "@/components/layout/AppIcons";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { askUnifiedAssistant } from "@/lib/api";
import { readAssistantPortfolio, type AssistantContext, type UnifiedAssistantResponse } from "@/lib/assistant-context";
import { useAssistantContext } from "./AssistantContextProvider";
import styles from "./GlobalAssistant.module.css";

type Turn = { role: "user" | "assistant"; text: string; result?: UnifiedAssistantResponse };
const PORTFOLIO_CUE = /portefeuille|positions|allocation|concentration|diversification|sous.perform|underperform|chevauch|overlap|doublonn|cluster|contribu|watchtower|(?:mon|mes|my).{0,30}risqu|my portfolio|my positions|my risk/i;
const EXPLICIT_SWITCH = /\b(?:ETF|FNB)\b|gouvernement|province|canada 360|qu[eé]bec|ontario|alberta|passeport|statistique|march[eé]|market|terminal|actualit[eé]|news|\b(?:SHOP|XIC|LSPD)\b|\bcompare\b/i;
const EXPLICIT_INSTRUMENT = /\b(?:analyse|cours|prix)\s+(?:de|du|pour)\s+[A-Z][A-Z0-9.^-]{0,9}\b/;
const SKILL_LABELS: Record<string, string> = { canada360: "Canada 360", fixed_income: "Taux & Obligations", portfolio_analysis: "Portefeuille", stock_analysis: "Focus", etf_analysis: "ETF", etf_performance: "Performance ETF", etf_ranking: "Classement ETF", etf_comparison: "Comparaison ETF", compare: "Comparateur", market_analysis: "Marché", news_context: "Actualités", data_quality: "Qualité des données" };
const SAFE_HREF = /^\/(?:focus\/[A-Z0-9.^-]{1,15}|etf(?:\/[A-Z0-9.^-]{1,15})?|portefeuille|comparateur(?:\?symbols=[A-Z0-9.^,-]{1,80})?|actualites|canada|taux-obligations|terminal|screener|assistant|qualite)$/;

function AssistantText({ text, collapseSources = false, onReady }: { text: string; collapseSources?: boolean; onReady: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const moduleUrl = "/assistant-rich-text.mjs";
    void import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl).then((renderer) => {
      if (active && host.current) host.current.replaceChildren(renderer.renderAssistantRichText(text, { collapseSources }));
    }).catch(() => { if (active && host.current) host.current.textContent = text; })
      .finally(() => { if (active) onReady(); });
    return () => { active = false; };
  }, [text, collapseSources, onReady]);
  return <div className={styles.richText} ref={host} />;
}

function PortfolioPositionSummary({ evidence }: { evidence: UnifiedAssistantResponse["evidence"] }) {
  const rows = evidence.flatMap((bundle) => bundle.position_rows ?? []);
  if (!rows.length) return null;
  const money = (value: number, currency: string) => `${value.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} ${currency}`;
  return <div className={styles.positions} aria-label="Principales positions du portefeuille">
    <strong>Positions observées</strong>
    <div className={styles.positionsGrid}>
      {rows.slice(0, 10).map((row) => <div className={styles.position} key={row.symbol}>
        <strong>{row.symbol}</strong><span>{row.weight_percent.toFixed(1)} %</span>
        <small>{money(row.market_value, row.base_currency)}</small>
        <small>P&amp;L latent {money(row.unrealized_pnl, row.base_currency)}</small>
      </div>)}
    </div>
    {rows.length > 10 && <small>+ {rows.length - 10} autres positions dans Portefeuille</small>}
  </div>;
}

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
  const backdrop = useRef<HTMLDivElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const readingPosition = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const activeContext: AssistantContext = removedForRoute === context.route
    ? { ...context, surface: "other", route: "", symbol: undefined, symbols: [], instrument_type: "unknown" }
    : context;
  const composerPlaceholder = ({
    portfolio: "Pose une question sur ton portefeuille…",
    stock: "Pose une question sur ce titre…",
    etf: "Pose une question sur cet ETF…",
    canada360: "Pose ta question à Canada 360…",
    fixed_income: "Pose une question sur les taux et obligations…",
    market: "Pose une question sur le marché…",
  } as Partial<Record<AssistantContext["surface"], string>>)[activeContext.surface]
    ?? "Pose une question à Anatole…";

  const keepReadingPosition = useCallback(() => {
    const node = history.current;
    if (node) node.scrollTop = nearBottom.current ? node.scrollHeight : readingPosition.current;
  }, []);
  useLayoutEffect(keepReadingPosition, [keepReadingPosition, open, turns, loading, pendingPermission, error]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const resize = () => {
      const node = backdrop.current;
      if (!node) return;
      node.style.height = `${viewport?.height ?? window.innerHeight}px`;
      node.style.top = `${viewport?.offsetTop ?? 0}px`;
      requestAnimationFrame(keepReadingPosition);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    backdrop.current?.querySelector<HTMLButtonElement>("header button")?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      previous?.focus({ preventScroll: true });
    };
  }, [open, keepReadingPosition]);

  async function submit(text: string, consent = authorized, positions?: ReturnType<typeof readAssistantPortfolio>, resume = false) {
    if (!text.trim() || loading) return;
    const lastSkill = [...turns].reverse().find((turn) => turn.result)?.result?.intent;
    const needsPortfolio = PORTFOLIO_CUE.test(text) ||
      !EXPLICIT_SWITCH.test(text) && !EXPLICIT_INSTRUMENT.test(text) &&
      (lastSkill === "portfolio_analysis" || !lastSkill && activeContext.surface === "portfolio");
    const selectedPositions = positions ?? (consent && needsPortfolio ? readAssistantPortfolio() : []);
    setLoading(true);
    const controller = new AbortController();
    pending.current = controller;
    setError(null);
    setPendingPermission(null);
    if (!resume) setTurns((current) => [...current, { role: "user", text }]);
    try {
      const result = await askUnifiedAssistant({ message: text, context: {
        ...activeContext, portfolio_scope: { authorized: consent, position_count: consent ? selectedPositions.length : 0 },
      }, conversation_id: conversationId, portfolio_consent: consent && selectedPositions.length > 0,
      portfolio_positions: selectedPositions }, controller.signal);
      if (pending.current !== controller) return;
      setConversationId(result.conversation_id);
      if (result.permission_required) { setAuthorized(false); setPendingPermission(text); }
      else setTurns((current) => [...current, { role: "assistant", text: result.answer, result }]);
    } catch (cause) {
      if (pending.current !== controller) return;
      setError(cause instanceof Error ? cause.message : "Assistant indisponible.");
    } finally { if (pending.current === controller) setLoading(false); }
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
    {open && <div className={styles.backdrop} ref={backdrop} onKeyDown={(event) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href], summary')];
      const next = event.shiftKey ? nodes.at(-1) : nodes[0];
      if (document.activeElement === (event.shiftKey ? nodes[0] : nodes.at(-1))) { event.preventDefault(); next?.focus({ preventScroll: true }); }
    }} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.drawer} role="dialog" aria-modal="true" aria-label="Anatole Assistant">
        <header className={styles.header}><div><strong>Anatole Assistant</strong><small>Ask → Analyze → Navigate</small></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer l’assistant"><X size={20} /></button></header>
        <div className={styles.toolbar}>
          {removedForRoute !== context.route && context.surface !== "other" && <span className={styles.chip}>{label}<button type="button" onClick={() => setRemovedForRoute(context.route)} aria-label="Retirer le contexte"><X size={14} /></button></span>}
          <button type="button" className={styles.reset} onClick={() => { pending.current?.abort(); pending.current = null; setLoading(false); setError(null); setMessage(""); nearBottom.current = true; readingPosition.current = 0; setTurns([]); setConversationId(undefined); setAuthorized(false); setPendingPermission(null); }}>Nouvelle conversation</button>
        </div>
        <div className={styles.history} aria-label="Historique de la conversation" role="log" aria-live="polite" ref={history} onScroll={() => {
          const node = history.current;
          if (node) { readingPosition.current = node.scrollTop; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; }
        }}>
          {turns.length === 0 && <p className={styles.intro}>Posez une question sur cette page, un titre, un ETF, votre portefeuille ou Canada 360.</p>}
          {turns.map((turn, index) => <article key={index} className={turn.role === "user" ? styles.userTurn : styles.assistantTurn}>
            {turn.result && <span className={styles.skillChip}>{SKILL_LABELS[turn.result.intent] ?? turn.result.intent}</span>}
            {turn.role === "assistant" ? <AssistantText onReady={keepReadingPosition} text={turn.text} collapseSources={Boolean(turn.result?.evidence.some((row) => row.sources.length > 0))} /> : <p>{turn.text}</p>}
            {turn.result?.intent === "portfolio_analysis" && <PortfolioPositionSummary evidence={turn.result.evidence} />}
            {turn.result?.evidence.some((row) => row.sources.length > 0) && <details><summary>{turn.result.intent === "canada360"
              ? `Sources officielles (${turn.result.evidence.flatMap((row) => row.sources).length})`
              : "Sources et données utilisées"}</summary>
              {turn.result.evidence.flatMap((row) => row.sources).map((source, i) => <p key={`${source.label}-${i}`} className={styles.source}>
                {source.url && /^https:\/\/[^\s]+$/i.test(source.url)
                  ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
                  : source.label} · {source.freshness}{source.timestamp ? ` · ${new Date(source.timestamp).toLocaleDateString("fr-CA")}` : ""}</p>)}
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
        </div>
        <form className={styles.composer} onSubmit={onSubmit}><label htmlFor="global-assistant-question">Votre question</label>
          <div><textarea id="global-assistant-question" value={message} maxLength={1200} onChange={(event) => setMessage(event.target.value)} placeholder={composerPlaceholder} rows={2} />
            <button type="submit" disabled={loading || !message.trim()} aria-label="Envoyer la question"><Send size={18} /></button></div>
        </form>
      </section>
    </div>}
  </>;
}
