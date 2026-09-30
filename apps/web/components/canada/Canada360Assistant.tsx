"use client";

import {
  type FormEvent,
  useRef,
  useState,
} from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./Canada360Assistant.module.css";

type Mode = "ask" | "compare" | "find";

type LinkItem = {
  label: string;
  url: string;
  level: "federal" | "provincial" | "statistics";
};

type ApiReply = {
  answer: string;
  links: LinkItem[];
  source_line: string | null;
};

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
  links?: LinkItem[];
  sourceLine?: string | null;
};

const SUGGESTIONS = {
  fr: {
    ask: [
      "Quel est le taux de chômage au Québec ?",
      "Quelle est l’inflation au Canada ?",
    ],
    compare: [
      "Compare le chômage au Québec et en Ontario",
      "Compare la population de l’Alberta et du Québec",
    ],
    find: [
      "Où trouver les prestations gouvernementales au Québec ?",
      "Où trouver de l’aide pour démarrer une PME ?",
    ],
  },
  en: {
    ask: [
      "What is Quebec's unemployment rate?",
      "What is Canada's inflation rate?",
    ],
    compare: [
      "Compare unemployment in Quebec and Ontario",
      "Compare Alberta and Quebec population",
    ],
    find: [
      "Where can I find government benefits in Quebec?",
      "Where can I find support to start a business?",
    ],
  },
} as const;

export function Canada360Assistant({
  language,
  selectedProvinceCode,
}: {
  language: AnatoleLanguage;
  selectedProvinceCode: string | null;
}) {
  const [mode, setMode] = useState<Mode>("ask");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(2);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      text: pick(
        language,
        "Pose une question sur une statistique, un service public ou une ressource gouvernementale. Les réponses privilégient les sources officielles.",
        "Ask about a statistic, public service or government resource. Answers prioritize official sources.",
      ),
    },
  ]);

  const submitQuestion = async (question: string) => {
    const clean = question.trim();
    if (!clean || busy) return;

    const userId = nextId.current;
    nextId.current += 1;
    const assistantId = nextId.current;
    nextId.current += 1;

    setMessages((current) => [
      ...current.slice(-6),
      {
        id: userId,
        role: "user",
        text: clean,
      },
    ]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch(
        "/api/anatole/api/v1/canada/assistant",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            question: clean,
            lang: language,
            jurisdiction: selectedProvinceCode ?? "CA",
            mode,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Canada 360 Assistant (${response.status})`);
      }

      const payload = (await response.json()) as ApiReply;

      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          text: payload.answer,
          links: payload.links,
          sourceLine: payload.source_line,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          text: pick(
            language,
            "Je n’ai pas pu vérifier cette réponse pour le moment. Utilise les ressources officielles de Canada 360 et réessaie.",
            "I could not verify this answer right now. Use Canada 360's official resources and try again.",
          ),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(input);
  };

  return (
    <section
      className={`panel ${styles.shell}`}
      data-testid="canada360-assistant"
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <div>
            <span className="eyebrow">
              CANADA 360 ASSISTANT
            </span>
            <h2>
              {pick(
                language,
                "Demande. Compare. Trouve.",
                "Ask. Compare. Find.",
              )}
            </h2>
          </div>
        </div>

        <div className={styles.trust}>
          {pick(
            language,
            "Sources officielles prioritaires",
            "Official sources first",
          )}
        </div>
      </header>

      <div className={styles.toolbar}>
        <div
          className={styles.modes}
          aria-label={pick(
            language,
            "Mode de l’assistant",
            "Assistant mode",
          )}
        >
          {([
            ["ask", "Demander", "Ask"],
            ["compare", "Comparer", "Compare"],
            ["find", "Trouver", "Find"],
          ] as const).map(([key, fr, en]) => (
            <button
              type="button"
              key={key}
              className={
                mode === key ? styles.activeMode : undefined
              }
              onClick={() => setMode(key)}
              data-testid={`canada360-assistant-mode-${key}`}
            >
              {pick(language, fr, en)}
            </button>
          ))}
        </div>

        <span className={styles.context}>
          {pick(language, "Contexte", "Context")} ·{" "}
          {selectedProvinceCode ?? "CA"}
        </span>
      </div>

      <div
        className={styles.chat}
        aria-live="polite"
        data-testid="canada360-assistant-chat"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={
              message.role === "user"
                ? styles.userMessage
                : styles.assistantMessage
            }
          >
            <span className={styles.role}>
              {message.role === "user"
                ? pick(language, "TOI", "YOU")
                : "CANADA 360"}
            </span>

            <p>{message.text}</p>

            {message.links?.length ? (
              <div className={styles.links}>
                {message.links.map((link) => (
                  <a
                    href={link.url}
                    key={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>
                      {link.level === "statistics"
                        ? pick(language, "Statistique", "Statistics")
                        : link.level === "federal"
                          ? pick(language, "Fédéral", "Federal")
                          : pick(language, "Provincial", "Provincial")}
                    </span>
                    <strong>{link.label}</strong>
                  </a>
                ))}
              </div>
            ) : null}

            {message.sourceLine ? (
              <small className={styles.sourceLine}>
                {message.sourceLine}
              </small>
            ) : null}
          </article>
        ))}
      </div>

      <div className={styles.suggestions}>
        {SUGGESTIONS[language][mode].map((suggestion) => (
          <button
            type="button"
            key={suggestion}
            onClick={() => void submitQuestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className={styles.composer}
        onSubmit={onSubmit}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={pick(
            language,
            "Ex. Quel est le chômage au Québec ?",
            "E.g. What is unemployment in Quebec?",
          )}
          aria-label={pick(
            language,
            "Question à Canada 360",
            "Question for Canada 360",
          )}
          data-testid="canada360-assistant-input"
        />

        <button
          type="submit"
          disabled={busy}
        >
          {busy
            ? pick(language, "Vérification…", "Checking…")
            : pick(language, "Envoyer", "Send")}
        </button>
      </form>

      <footer className={styles.footer}>
        {pick(
          language,
          "Canada 360 ne remplace pas une décision administrative et ne déduit pas ton admissibilité.",
          "Canada 360 does not replace an administrative decision or infer your eligibility.",
        )}
      </footer>
    </section>
  );
}
