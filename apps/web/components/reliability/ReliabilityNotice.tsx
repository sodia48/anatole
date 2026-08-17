"use client";

import { WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { ApiTrace } from "@/lib/reliability";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";

import styles from "./ReliabilityNotice.module.css";

type Notice = {
  message: string;
  requestId?: string;
};

export function ReliabilityNotice() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const onTrace = (event: Event) => {
      const trace = (event as CustomEvent<ApiTrace>).detail;
      if (!trace?.stale) return;
      setNotice({
        message:
          pick(language, "Une source répond mal. Anatole affiche la dernière donnée valide au lieu d’un écran vide.", "A source is not responding correctly. Anatole is showing the latest valid data instead of an empty screen."),
        requestId: trace.requestId,
      });
    };
    const onOffline = () =>
      setNotice({
        message:
          pick(language, "Connexion Internet interrompue. Les données déjà chargées restent consultables.", "Internet connection interrupted. Previously loaded data remains available."),
      });
    const onOnline = () => setNotice(null);

    window.addEventListener("anatole:api-trace", onTrace);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!window.navigator.onLine) onOffline();

    return () => {
      window.removeEventListener("anatole:api-trace", onTrace);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [language]);

  if (!notice) return null;

  return (
    <aside className={styles.notice} role="status" aria-live="polite">
      <WifiOff size={17} aria-hidden="true" />
      <span>
        <b>{pick(language, "Mode résilient", "Resilient mode")}</b>
        <small>{notice.message}</small>
        {notice.requestId ? <code>{notice.requestId}</code> : null}
      </span>
      <button type="button" onClick={() => setNotice(null)} aria-label={pick(language, "Fermer", "Close")}>
        <X size={16} />
      </button>
    </aside>
  );
}
