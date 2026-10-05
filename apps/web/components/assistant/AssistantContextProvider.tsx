"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { assistantContextLabel, deriveAssistantContext, type AssistantContext } from "@/lib/assistant-context";
import { GlobalAssistant } from "./GlobalAssistant";

type Bridge = { context: AssistantContext; label: string; publish: (extra: Partial<AssistantContext>) => void };
const BridgeContext = createContext<Bridge | null>(null);

export function useAssistantContext(): Bridge {
  const value = useContext(BridgeContext);
  if (!value) throw new Error("AssistantContextProvider missing");
  return value;
}

function AssistantQueryObserver({ onChange }: { onChange: (search: string) => void }) {
  const search = useSearchParams();
  const searchString = search.toString();
  useEffect(() => { queueMicrotask(() => onChange(searchString)); }, [onChange, searchString]);
  return null;
}

export function AssistantContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const route = pathname ?? "/";
  const [searchString, setSearchString] = useState("");
  const base = useMemo(() => deriveAssistantContext(route, new URLSearchParams(searchString), preferences.language),
    [route, searchString, preferences.language]);
  const [published, setPublished] = useState<{ route: string; extra: Partial<AssistantContext> } | null>(null);
  const publish = useCallback((extra: Partial<AssistantContext>) => setPublished({ route, extra }), [route]);
  const context = useMemo(() => published?.route === route ? { ...base, ...published.extra } : base,
    [base, published, route]);
  const value = useMemo(() => ({ context, label: assistantContextLabel(context), publish }), [context, publish]);
  return <BridgeContext.Provider value={value}>
    {children}
    <Suspense fallback={null}><AssistantQueryObserver onChange={setSearchString} /></Suspense>
    <GlobalAssistant />
  </BridgeContext.Provider>;
}
