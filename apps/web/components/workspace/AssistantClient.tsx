"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  BriefcaseBusiness,
  Database,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { askAnatole } from "@/lib/api";
import type {
  AssistantResponse,
  PortfolioPositionInput,
} from "@/lib/types";

import styles from "./Workspace.module.css";

const PORTFOLIO_KEY = "anatole:portfolio:v1";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: AssistantResponse;
  createdAt: number;
};

const STARTERS = [
  "Quel est le régime du marché canadien ?",
  "Compare RY et TD",
  "Analyse SHOP",
  "Évalue la qualité des données",
];

function loadPortfolio(): PortfolioPositionInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PORTFOLIO_KEY);
    const parsed = raw ? (JSON.parse(raw) as PortfolioPositionInput[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toneClass(tone: string): string {
  if (tone === "positive") return styles.positive;
  if (tone === "negative") return styles.negative;
  if (tone === "info") return styles.info;
  return "";
}

export function AssistantClient() {
  const searchParams = useSearchParams();
  const contextSymbol = searchParams.get("symbol")?.toUpperCase() ?? undefined;
  const [portfolio, setPortfolio] = useState<PortfolioPositionInput[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(contextSymbol ? `Analyse ${contextSymbol}` : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPortfolio(loadPortfolio());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (messageText = input) => {
    const clean = messageText.trim();
    if (!clean || loading) return;
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: clean,
      createdAt: Date.now(),
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const response = await askAnatole(
        clean,
        {
          contextSymbol,
          portfolioPositions: portfolio,
        },
        controller.signal,
      );
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: response.answer.replaceAll("**", ""),
          response,
          createdAt: Date.now(),
        },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Assistant temporairement indisponible.");
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const lastResponse = useMemo(
    () => [...messages].reverse().find((item) => item.response)?.response,
    [messages],
  );

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">INTELLIGENCE · V0.7</span>
          <h1>Assistant Anatole</h1>
          <p>Un assistant contextuel fondé sur les données réellement présentes dans Anatole : marché, titres, comparaisons, portefeuille et qualité des sources. Aucun abonnement à une API d’IA externe n’est requis.</p>
        </div>
        <div className={styles.heroMetric}>
          <strong><Sparkles size={48} /></strong>
          <span>moteur contextuel</span>
          <small>{portfolio.length} position{portfolio.length > 1 ? "s" : ""} locale{portfolio.length > 1 ? "s" : ""} accessible{portfolio.length > 1 ? "s" : ""}</small>
        </div>
      </section>

      <div className={styles.assistantLayout}>
        <section className={`panel ${styles.chatPanel}`}>
          <header className={styles.chatHeader}>
            <div className={styles.cardHeader}>
              <div><span className="eyebrow">CONVERSATION</span><h3>Analyste contextuel</h3><p>Les réponses indiquent leurs sources et leur niveau de confiance.</p></div>
              <span className={`${styles.statusPill} ${styles.statusHealthy}`}>Données Anatole</span>
            </div>
          </header>

          <div className={`${styles.chatScroll} ${styles.chatList}`} ref={scrollRef}>
            {!messages.length ? (
              <div className={styles.emptyState}>
                <Bot size={32} />
                <strong>Que veux-tu analyser ?</strong>
                <span>Essaie une question de marché, un symbole ou une comparaison.</span>
                <div className={styles.chipRow} style={{ justifyContent: "center" }}>
                  {STARTERS.map((prompt) => <button className={styles.promptChip} type="button" key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <article className={`${styles.chatMessage} ${message.role === "user" ? styles.chatMessageUser : styles.chatMessageAssistant}`} key={message.id}>
                {message.role === "assistant" && message.response ? <div className={styles.cardHeader} style={{ marginBottom: 10 }}><div><span className="eyebrow">ANATOLE</span><h3>{message.response.title}</h3></div><span className={styles.statusPill}>Confiance {message.response.confidence}</span></div> : null}
                <p>{message.text}</p>
                {message.response?.facts.length ? (
                  <div className={styles.factGrid}>
                    {message.response.facts.map((fact) => <div className={styles.fact} key={`${message.id}-${fact.label}`}><span>{fact.label}</span><strong className={toneClass(fact.tone)}>{fact.value}</strong></div>)}
                  </div>
                ) : null}
                {message.response?.links.length ? <div className={styles.assistantLinks}>{message.response.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</div> : null}
                {message.response?.sources.length ? (
                  <div className={styles.notice} style={{ marginTop: 12 }}>
                    <strong>Sources :</strong> {message.response.sources.map((source) => `${source.label} — ${source.detail}`).join(" · ")}
                  </div>
                ) : null}
                {message.response ? <div style={{ marginTop: 10, color: "#6d879a", fontSize: 9 }}>{message.response.disclaimer}</div> : null}
                <time>{new Date(message.createdAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</time>
              </article>
            ))}

            {loading ? <article className={`${styles.chatMessage} ${styles.chatMessageAssistant}`}><div className={styles.inlineBetween}><span>Analyse des données Anatole…</span><Sparkles size={16} /></div></article> : null}
          </div>

          <form className={styles.composer} onSubmit={submit}>
            {error ? <div className={styles.errorNotice} style={{ marginBottom: 10 }}>{error}</div> : null}
            <div className={styles.composerBox}>
              <textarea className={styles.chatInput} rows={2} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ex. Compare RY et TD, analyse mon portefeuille, quel secteur domine ?" />
              <button className={styles.primaryButton} type="submit" disabled={loading || !input.trim()}><Send size={16} /> Envoyer</button>
            </div>
            {lastResponse?.suggestions.length ? <div className={styles.chipRow} style={{ marginTop: 10 }}>{lastResponse.suggestions.map((suggestion) => <button className={styles.promptChip} type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>)}</div> : null}
          </form>
        </section>

        <aside className={styles.compactList}>
          <section className={`panel ${styles.contextCard}`}>
            <div className={styles.cardHeader}><div><span className="eyebrow">CONTEXTE</span><h3>Données accessibles</h3></div></div>
            <div className={styles.contextRow}><span>Marché</span><strong>TSX 60 + Composite</strong></div>
            <div className={styles.contextRow}><span>Portefeuille</span><strong>{portfolio.length} position{portfolio.length > 1 ? "s" : ""}</strong></div>
            <div className={styles.contextRow}><span>Symbole actif</span><strong>{contextSymbol ?? "Aucun"}</strong></div>
            <div className={styles.contextRow}><span>Moteur</span><strong>Règles + données live</strong></div>
          </section>

          <section className={`panel ${styles.contextCard}`}>
            <div className={styles.cardHeader}><div><span className="eyebrow">CAPACITÉS</span><h3>Ce qu’il sait faire</h3></div></div>
            <div className={styles.contextRow}><span><Database size={13} /> Données</span><strong>Titres et marché</strong></div>
            <div className={styles.contextRow}><span><BriefcaseBusiness size={13} /> Portefeuille</span><strong>Risque et concentration</strong></div>
            <div className={styles.contextRow}><span><ShieldCheck size={13} /> Qualité</span><strong>Sources et fraîcheur</strong></div>
            <div className={styles.notice}>Le moteur ne fabrique pas de données absentes. Quand une source est en secours ou dégradée, la réponse l’indique.</div>
          </section>

          <section className={`panel ${styles.contextCard}`}>
            <div className={styles.cardHeader}><div><span className="eyebrow">RACCOURCIS</span><h3>Ouvrir une section</h3></div></div>
            <div className={styles.assistantLinks}><Link href="/terminal">Terminal Pro</Link><Link href="/comparateur">Comparateur</Link><Link href="/portefeuille">Portefeuille</Link><Link href="/qualite">Qualité</Link></div>
          </section>
        </aside>
      </div>
    </main>
  );
}
