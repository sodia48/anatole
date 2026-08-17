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
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";

import styles from "./FeedbackButton.module.css";

const CATEGORY_OPTIONS: Array<{
  value: FeedbackCategory;
  label: readonly [string, string];
}> = [
  { value: "bug", label: ["Quelque chose ne fonctionne pas", "Something is not working"] },
  { value: "data", label: ["Une donnée semble incorrecte", "Some data appears incorrect"] },
  { value: "performance", label: ["La page est lente", "The page is slow"] },
  { value: "interface", label: ["L’interface est difficile à utiliser", "The interface is difficult to use"] },
  { value: "other", label: ["Autre", "Other"] },
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
  const { preferences } = usePreferences();
  const language = preferences.language;
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
    () => {
      const label = CATEGORY_OPTIONS.find((item) => item.value === category)?.label;
      return label ? pick(language, label[0], label[1]) : "";
    },
    [category, language],
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
      setError(pick(language, "Décris le problème en quelques mots.", "Describe the issue in a few words."));
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
    } catch {
      setError(pick(language, "Le signalement n’a pas pu être transmis.", "The report could not be submitted."));
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
        aria-label={pick(language, "Signaler un problème", "Report a problem")}
        data-client-ready="false"
      >
        <Bug size={17} aria-hidden="true" />
        <span>{pick(language, "Signaler un problème", "Report a problem")}</span>
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
              aria-label={pick(language, "Fermer", "Close")}
            >
              <X size={18} />
            </button>

            {reportId ? (
              <div className={styles.success}>
                <CheckCircle2 size={34} />
                <span className="eyebrow">{pick(language, "SIGNALÉ", "REPORTED")}</span>
                <h2 id="feedback-title">{pick(language, "Merci, le problème est enregistré.", "Thank you, the issue has been recorded.")}</h2>
                <p>
                  {pick(language, "Référence", "Reference")} <strong>{reportId}</strong>. {pick(language, "Garde-la si tu souhaites suivre ce problème dans les logs Render.", "Keep it if you want to track this issue in the Render logs.")}
                </p>
                <button type="button" className={styles.primary} onClick={close}>
                  {pick(language, "Fermer", "Close")}
                </button>
              </div>
            ) : (
              <>
                <span className="eyebrow">{pick(language, "BÊTA PRIVÉE", "PRIVATE BETA")} · V0.8</span>
                <h2 id="feedback-title">{pick(language, "Que s’est-il passé ?", "What happened?")}</h2>
                <p className={styles.intro}>
                  {pick(language, "Ton signalement inclut la section et l’identifiant technique de la dernière requête, jamais ton portefeuille ni ton profil Anatole Conseil.", "Your report includes the section and technical identifier of the latest request, never your portfolio or Anatole Advisor profile.")}
                </p>

                <label className={styles.field}>
                  <span>{pick(language, "Type de problème", "Issue type")}</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                  >
                    {CATEGORY_OPTIONS.map((item) => (
                      <option value={item.value} key={item.value}>
                        {pick(language, item.label[0], item.label[1])}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>{pick(language, "Décris ce que tu voyais et ce que tu attendais", "Describe what you saw and what you expected")}</span>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    maxLength={2000}
                    rows={5}
                    placeholder={pick(language, `Exemple : ${selectedLabel.toLowerCase()} dans le Cockpit…`, `Example: ${selectedLabel.toLowerCase()} in the Cockpit…`)}
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
                    <b>{pick(language, "Inclure les diagnostics techniques", "Include technical diagnostics")}</b>
                    <small>
                      {pick(language, "Route, taille d’écran, navigateur et X-Request-ID uniquement.", "Route, viewport size, browser, and X-Request-ID only.")}
                    </small>
                  </span>
                </label>

                <div className={styles.privacy}>
                  <ShieldCheck size={16} />
                  <span>{pick(language, "Aucune donnée financière personnelle n’est jointe.", "No personal financial data is attached.")}</span>
                </div>

                {error ? <div className={styles.error}>{error}</div> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close}>
                    {pick(language, "Annuler", "Cancel")}
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={sending || message.trim().length < 5}
                    onClick={() => void send()}
                  >
                    <Send size={16} />
                    {sending ? pick(language, "Envoi…", "Sending…") : pick(language, "Envoyer", "Send")}
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
