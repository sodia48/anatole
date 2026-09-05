import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { dehydrate, QueryClient } from "@tanstack/react-query";

import { MOBILE_CACHE_BUSTER, MOBILE_CACHE_KEY, PERSISTED_QUERY_SCOPES, scheduleReconnectRefresh, shouldDehydrateMobileQuery } from "./offlineCache";

beforeEach(async () => {
  await AsyncStorage.clear();
});

it("versions persisted contracts and stages reconnect refreshes", () => {
  jest.useFakeTimers();
  const invalidateQueries = jest.fn(() => Promise.resolve());
  const cancel = scheduleReconnectRefresh({ invalidateQueries } as unknown as QueryClient);
  expect(MOBILE_CACHE_BUSTER).toContain("v3");
  expect(MOBILE_CACHE_KEY).toContain("v3");
  expect(PERSISTED_QUERY_SCOPES.has("portfolio")).toBe(true);
  expect(invalidateQueries).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(invalidateQueries).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(300);
  expect(invalidateQueries).toHaveBeenCalledTimes(3);
  expect(invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: ["portfolio"], refetchType: "active" });
  expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["terminal"], refetchType: "active" });
  jest.advanceTimersByTime(2_100);
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["terminal"], refetchType: "active" });
  cancel();
  jest.useRealTimers();
});

it("persists only successful queries in an allowed scope", () => {
  const client = new QueryClient();
  client.getQueryCache().build(client, {
    queryKey: ["stock-news", "RY", "fr"],
    queryFn: async () => ({ items: [] }),
  });
  client.setQueryData(["portfolio"], { total_market_value: 100 });
  client.setQueryData(["private-scope"], { secret: true });

  const snapshot = dehydrate(client, { shouldDehydrateQuery: shouldDehydrateMobileQuery });

  expect(snapshot.queries.map((query) => query.queryKey)).toEqual([["portfolio"]]);
  client.clear();
});

it("does not dehydrate a cancelled stock-news query", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let observedSignal: AbortSignal | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const request = client.fetchQuery({
    queryKey: ["stock-news", "RY", "fr"],
    queryFn: ({ signal }) => {
      observedSignal = signal;
      markStarted?.();
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  }).catch((error: unknown) => error);

  await started;
  await client.cancelQueries({ queryKey: ["stock-news", "RY", "fr"] });
  await request;

  expect(observedSignal?.aborted).toBe(true);
  expect(dehydrate(client, { shouldDehydrateQuery: shouldDehydrateMobileQuery }).queries).toHaveLength(0);
  client.clear();
});

it("does not restore a portfolio snapshot stored under the v2 cache key", async () => {
  await AsyncStorage.setItem("anatole.mobile.query-cache.v2", JSON.stringify({
    buster: "anatole-mobile-contract-v2",
    timestamp: Date.now(),
    clientState: { mutations: [], queries: [{ queryKey: ["portfolio"] }] },
  }));
  const persister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: MOBILE_CACHE_KEY,
    throttleTime: 0,
  });

  expect(await persister.restoreClient()).toBeUndefined();
});
