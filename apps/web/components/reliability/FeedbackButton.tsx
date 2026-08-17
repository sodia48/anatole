"use client";

import {
  Bug,
  CheckCircle2,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getLastApiTrace,
  submitFeedback,
  type FeedbackCategory,
} from "@/lib/reliability";
import { ANATOLE_VERSION } from "@/lib/version";

import styles from "./FeedbackButton.module.css";

const CATEGORY_OPTIONS: Array<{
  value: FeedbackCategory;
  label: string;
}> = [
  { value: "bug", label: "Quelque chose ne fonctionne pas" },
  { value: "data", label: "Une donnée semble incorrecte" },
  { value: "performance", label: "La page est lente" },
  { value: "interface", label: "L’interface est difficile à utiliser" },
  { value: "other", label: "Autre" },
];

function currentSection(): string | null {
  if (typeof document === "undefined") return null;
  return document.body.dataset.anatoleSection ?? null;
}

function currentUniverse(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("anatole:cockpit-universe");
  } catch {
    return null;
  }
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedLabel = useMemo(
    () => CATEGORY_OPTIONS.find((item) => item.value === category)?.label,
    [category],
  );

  useEffect(() => {
    const openDialog = () => setOpen(true);
    window.addEventListener("anatole:open-feedback", openDialog);
    triggerRef.current?.setAttribute("data-client-ready", "true");
    return () => window.removeEventListener("anatole:open-feedback", openDialog);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const reset = () => {
    setCategory("bug");
    setMessage("");
    setIncludeDiagnostics(true);
    setError(null);
    setReportId(null);
  };

  const close = () => {
    setOpen(false);
    window.setTimeout(reset, 180);
  };

  const send = async () => {
    const clean = message.trim();
    if (clean.length < 5) {
      setError("Décris le problème en quelques mots.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const trace = getLastApiTrace();
      const result = await submitFeedback({
        category,
        message: clean,
        route: window.location.pathname,
        section: currentSection(),
        universe: currentUniverse(),
        request_id: includeDiagnostics ? trace?.requestId ?? null : null,
        user_agent: includeDiagnostics ? window.navigator.userAgent : null,
        viewport_width: includeDiagnostics ? window.innerWidth : null,
        viewport_height: includeDiagnostics ? window.innerHeight : null,
        app_version: ANATOLE_VERSION,
        consent_diagnostics: includeDiagnostics,
      });
      setReportId(result.report_id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Le signalement n’a pas pu être transmis.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Signaler un problème"
        data-client-ready="false"
      >
        <Bug size={17} aria-hidden="true" />
        <span>Signaler un problème</span>
      </button>

      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={close}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.closeButton}
              onClick={close}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>

            {reportId ? (
              <div className={styles.success}>
                <CheckCircle2 size={34} />
                <span className="eyebrow">SIGNALÉ</span>
                <h2 id="feedback-title">Merci, le problème est enregistré.</h2>
                <p>
                  Référence <strong>{reportId}</strong>. Garde-la si tu souhaites
                  suivre ce problème dans les logs Render.
                </p>
                <button type="button" className={styles.primary} onClick={close}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <span className="eyebrow">BÊTA PRIVÉE · V0.8</span>
                <h2 id="feedback-title">Que s’est-il passé ?</h2>
                <p className={styles.intro}>
                  Ton signalement inclut la section et l’identifiant technique de
                  la dernière requête, jamais ton portefeuille ni ton profil Anatole Conseil.
                </p>

                <label className={styles.field}>
                  <span>Type de problème</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                  >
                    {CATEGORY_OPTIONS.map((item) => (
                      <option value={item.value} key={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Décris ce que tu voyais et ce que tu attendais</span>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    maxLength={2000}
                    rows={5}
                    placeholder={`Exemple : ${selectedLabel?.toLowerCase()} dans le Cockpit…`}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <small>{message.length}/2000</small>
                </label>

                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    checked={includeDiagnostics}
                    onChange={(event) => setIncludeDiagnostics(event.target.checked)}
                  />
                  <span>
                    <b>Inclure les diagnostics techniques</b>
                    <small>
                      Route, taille d’écran, navigateur et X-Request-ID uniquement.
                    </small>
                  </span>
                </label>

                <div className={styles.privacy}>
                  <ShieldCheck size={16} />
                  <span>Aucune donnée financière personnelle n’est jointe.</span>
                </div>

                {error ? <div className={styles.error}>{error}</div> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={sending || message.trim().length < 5}
                    onClick={() => void send()}
                  >
                    <Send size={16} />
                    {sending ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
