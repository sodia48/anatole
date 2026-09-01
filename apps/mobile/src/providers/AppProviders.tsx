import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type PropsWithChildren, useEffect } from "react";
import { AppState } from "react-native";

import { LocaleProvider } from "@/src/lib/i18n";
import { MobileAccountProvider } from "./MobileAccountProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      networkMode: "offlineFirst",
      refetchOnReconnect: true,
    },
    mutations: { networkMode: "online", retry: 0 },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "anatole.mobile.query-cache.v1",
  throttleTime: 1_000,
});

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => NetInfo.addEventListener((state) => {
    onlineManager.setOnline(Boolean(state.isConnected));
  }), []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => subscription.remove();
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{
      persister,
      maxAge: 1000 * 60 * 60 * 24,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => ["cockpit", "screener", "focus", "news", "earnings", "calendar", "stock-news", "etf-directory", "etf-holdings", "etf-history", "ipo", "insiders"].includes(String(query.queryKey[0])),
      },
    }}>
      <LocaleProvider>
        <MobileAccountProvider>{children}</MobileAccountProvider>
      </LocaleProvider>
    </PersistQueryClientProvider>
  );
}
