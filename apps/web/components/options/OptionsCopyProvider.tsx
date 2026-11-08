"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { OptionsCopyKey } from "@/app/options/options-copy";

type Copy = Record<OptionsCopyKey, { fr: string; en: string }>;
const OptionsCopyContext = createContext<Copy | null>(null);

export function OptionsCopyProvider({ copy, children }: { copy: Copy; children: ReactNode }) {
  return <OptionsCopyContext.Provider value={copy}>{children}</OptionsCopyContext.Provider>;
}

export function useOptionsText(language: "fr" | "en") {
  const copy = useContext(OptionsCopyContext);
  return useCallback((key: OptionsCopyKey) => {
    if (!copy) throw new Error("Options copy provider is missing");
    return copy[key][language];
  }, [copy, language]);
}
