"use client";

import { useEffect, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { AppearanceChooser } from "./AppearanceChooser";

export const APPEARANCE_CHOICE_KEY = "anatole.appearance-choice.v1";

export function AppearanceChoiceModal() {
  const { hydrated, preferences, updatePreferences } = usePreferences();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const root = document.documentElement;
      const embedded = root.dataset.focusEmbed === "true" || window.location.pathname.startsWith("/embed/focus");
      setVisible(!embedded && window.localStorage.getItem(APPEARANCE_CHOICE_KEY) !== "1");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated]);

  if (!visible) return null;

  return (
    <div className="appearance-backdrop" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
      <div id="appearance-title" className="sr-only">Appearance</div>
      <AppearanceChooser
        language={preferences.language}
        modal
        theme={preferences.theme}
        onSelect={(theme) => updatePreferences({ theme })}
        onConfirm={() => {
          window.localStorage.setItem(APPEARANCE_CHOICE_KEY, "1");
          setVisible(false);
        }}
      />
    </div>
  );
}
