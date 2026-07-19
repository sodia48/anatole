"use client";

import { useCallback, useEffect, useState } from "react";
import { getHealthStatus } from "@/lib/api";
import { REFRESH_INTERVALS } from "@/lib/refresh";

type State = "checking" | "online" | "offline";

export function ApiStatus() {
  const [state, setState] = useState<State>("checking");

  const check = useCallback(async (signal?: AbortSignal) => {
    try {
      await getHealthStatus(signal);
      setState("online");
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") setState("offline");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    const interval = window.setInterval(() => void check(), REFRESH_INTERVALS.apiHealth);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [check]);

  return (
    <span className={`api-status api-status-${state}`} title="État de la connexion à Anatole API">
      <span className="api-status-dot" />
      <span>{state === "online" ? "API en ligne" : state === "offline" ? "API indisponible" : "Connexion…"}</span>
    </span>
  );
}
