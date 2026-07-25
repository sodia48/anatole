"use client";

import type {
  ReactNode,
} from "react";

import { PreferencesProvider } from "@/components/providers/PreferencesProvider";

/**
 * Point unique pour les contextes globaux d’Anatole.
 *
 * Le PreferencesProvider doit entourer toute l’application :
 * PreferencesForm et les autres composants utilisent usePreferences()
 * pendant le rendu et le pré-rendu Next.js.
 */
export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PreferencesProvider>
      {children}
    </PreferencesProvider>
  );
}
