import type { QueryClient } from "@tanstack/react-query";

import { MOBILE_CACHE_BUSTER, PERSISTED_QUERY_SCOPES, scheduleReconnectRefresh } from "./offlineCache";

it("versions persisted contracts and stages reconnect refreshes", () => {
  jest.useFakeTimers();
  const invalidateQueries = jest.fn(() => Promise.resolve());
  const cancel = scheduleReconnectRefresh({ invalidateQueries } as unknown as QueryClient);
  expect(MOBILE_CACHE_BUSTER).toContain("v2");
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
