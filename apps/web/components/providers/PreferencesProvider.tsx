"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  readPreferences,
  writePreferences,
  type AnatolePreferences,
} from "@/lib/preferences";
import { WORKSPACE_SYNC_EVENT } from "@/lib/workspace-sync";

type PreferencesContextValue = {
  preferences: AnatolePreferences;
  hydrated: boolean;
  updatePreferences: (patch: Partial<AnatolePreferences>) => void;
  resetPreferences: () => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function applyPreferences(preferences: AnatolePreferences): void {
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.dataset.density = preferences.density;
  root.dataset.language = preferences.language;
  root.lang = preferences.language === "en" ? "en-CA" : "fr-CA";
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readPreferences();
      setPreferences(stored);
      applyPreferences(stored);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const applySyncedPreferences = () => {
      const stored = readPreferences();
      setPreferences(stored);
      applyPreferences(stored);
    };
    window.addEventListener(WORKSPACE_SYNC_EVENT, applySyncedPreferences);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, applySyncedPreferences);
  }, []);

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    hydrated,
    updatePreferences: (patch) => {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        writePreferences(next);
        applyPreferences(next);
        return next;
      });
    },
    resetPreferences: () => {
      writePreferences(DEFAULT_PREFERENCES);
      applyPreferences(DEFAULT_PREFERENCES);
      setPreferences(DEFAULT_PREFERENCES);
    },
  }), [hydrated, preferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
