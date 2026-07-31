"use client";

import { useEffect } from "react";

import {
  getLastApiTrace,
  openFeedbackDialog,
  reportClientEvent,
} from "@/lib/reliability";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientEvent({
      kind: "javascript_error",
      message: error.message || "Erreur de rendu Next.js",
      stack: error.stack,
      requestId: getLastApiTrace()?.requestId ?? null,
    });
  }, [error]);

  const trace = getLastApiTrace();

  return (
    <section className="empty-state">
      <span className="eyebrow">SERVICE TEMPORAIREMENT LIMITÉ</span>
      <h1>Anatole reste accessible.</h1>
      <p>
        Une source ou un composant n’a pas répondu correctement. Relance cette
        vue; les dernières données valides peuvent rester disponibles.
      </p>
      {trace?.requestId ? (
        <small>Référence technique : {trace.requestId}</small>
      ) : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="primary-button" onClick={reset}>Réessayer</button>
        <button className="secondary-button" onClick={openFeedbackDialog}>
          Signaler le problème
        </button>
      </div>
    </section>
  );
}
