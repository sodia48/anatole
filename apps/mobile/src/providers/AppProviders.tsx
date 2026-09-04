import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type PropsWithChildren, useEffect, useRef } from "react";
import { AppState } from "react-native";

import { LocaleProvider } from "@/src/lib/i18n";
import { MOBILE_CACHE_BUSTER, MOBILE_CACHE_KEY, MOBILE_CACHE_MAX_AGE, PERSISTED_QUERY_SCOPES, scheduleReconnectRefresh } from "@/src/lib/offlineCache";
import { MobileAccountProvider } from "./MobileAccountProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: MOBILE_CACHE_MAX_AGE,
      retry: 1,
      networkMode: "offlineFirst",
      refetchOnReconnect: false,
    },
    mutations: { networkMode: "online", retry: 0 },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: MOBILE_CACHE_KEY,
  throttleTime: 1_000,
});

export function AppProviders({ children }: PropsWithChildren) {
  const previousOnline = useRef<boolean | null>(null);
  const cancelReconnect = useRef<(() => void) | null>(null);

  useEffect(() => NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected);
    onlineManager.setOnline(online);
    if (previousOnline.current === false && online) {
      cancelReconnect.current?.();
      cancelReconnect.current = scheduleReconnectRefresh(queryClient);
    }
    previousOnline.current = online;
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
      maxAge: MOBILE_CACHE_MAX_AGE,
      buster: MOBILE_CACHE_BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => PERSISTED_QUERY_SCOPES.has(String(query.queryKey[0])),
      },
    }}>
      <LocaleProvider>
        <MobileAccountProvider>{children}</MobileAccountProvider>
      </LocaleProvider>
    </PersistQueryClientProvider>
  );
}
