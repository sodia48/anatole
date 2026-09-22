"use client";

import { useSyncExternalStore } from "react";

const FALLBACK_STABLE_URL = "https://anatole-mu.vercel.app";

function normalizedStableUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_STABLE_APP_URL?.trim();
  try {
    return new URL(configured || FALLBACK_STABLE_URL);
  } catch {
    return new URL(FALLBACK_STABLE_URL);
  }
}

function subscribeToLocation(): () => void {
  // L'URL ne change ici que par navigation du navigateur/Next.
  // Le composant est remonté lors des navigations pertinentes; aucun listener
  // global ni setState dans un effect n'est nécessaire.
  return () => undefined;
}

function getPreviewStableHref(): string | null {
  if (typeof window === "undefined") return null;

  const stable = normalizedStableUrl();
  const host = window.location.hostname.toLowerCase();
  const stableHost = stable.hostname.toLowerCase();

  const isVercelPreview =
    host.endsWith(".vercel.app")
    && host !== stableHost;

  if (!isVercelPreview) return null;

  stable.pathname = window.location.pathname;
  stable.search = window.location.search;
  stable.hash = window.location.hash;
  return stable.toString();
}

function getServerSnapshot(): null {
  return null;
}

export function PreviewPersistenceNotice() {
  const stableHref = useSyncExternalStore(
    subscribeToLocation,
    getPreviewStableHref,
    getServerSnapshot,
  );

  if (!stableHref) return null;

  return (
    <aside className="preview-persistence-notice" role="status">
      <div>
        <strong>Preview PR isolée</strong>
        <span>
          Cette URL possède sa propre session et son propre cache navigateur.
          Teste la connexion et les performances sur la bêta stable.
        </span>
      </div>
      <a href={stableHref}>Ouvrir la bêta stable</a>
    </aside>
  );
}