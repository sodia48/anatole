"use client";

import { useEffect } from "react";

import {
  getLastApiTrace,
  openFeedbackDialog,
  reportClientEvent,
} from "@/lib/reliability";

const AUTO_RECOVERY_KEY = "anatole:runtime-auto-recovery";
const AUTO_RECOVERY_WINDOW_MS = 2 * 60 * 1000;

function isDeploymentChunkError(error: Error & { digest?: string }): boolean {
  const text = `${error.name} ${error.message} ${error.stack ?? ""}`.toLowerCase();
  return [
    "chunkloaderror",
    "loading chunk",
    "failed to fetch dynamically imported module",
    "failed to load module script",
    "module chunk",
  ].some((token) => text.includes(token));
}

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

    // Un onglet ouvert pendant un déploiement peut garder un ancien chunk.
    // Un seul reload automatique récupère la nouvelle version sans boucler.
    if (!isDeploymentChunkError(error)) return;

    const fingerprint = [
      window.location.pathname,
      error.digest ?? "",
      error.message,
    ].join("|");
    const now = Date.now();

    try {
      const previousRaw = window.sessionStorage.getItem(AUTO_RECOVERY_KEY);
      const previous = previousRaw
        ? (JSON.parse(previousRaw) as {
            fingerprint?: string;
            at?: number;
          })
        : null;

      if (
        previous?.fingerprint === fingerprint
        && typeof previous.at === "number"
        && now - previous.at < AUTO_RECOVERY_WINDOW_MS
      ) {
        return;
      }

      window.sessionStorage.setItem(
        AUTO_RECOVERY_KEY,
        JSON.stringify({ fingerprint, at: now }),
      );
    } catch {
      // Le stockage privé ne doit pas empêcher la récupération.
    }

    const timer = window.setTimeout(() => window.location.reload(), 250);
    return () => window.clearTimeout(timer);
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
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button className="primary-button" onClick={reset}>
          Réessayer
        </button>
        <button
          className="secondary-button"
          onClick={openFeedbackDialog}
        >
          Signaler le problème
        </button>
      </div>
    </section>
  );
}
