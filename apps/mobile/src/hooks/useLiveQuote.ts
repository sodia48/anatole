import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { apiBaseUrl } from "@/src/lib/api/base";
import type { Quote } from "@/src/lib/api/types";

function socketUrl(ticker: string): string {
  const root = apiBaseUrl().replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${root}/ws/v1/quotes/${encodeURIComponent(ticker)}`;
}

export function useLiveQuote(ticker: string, initial?: Quote) {
  const [live, setLive] = useState<{ ticker: string; quote: Quote } | null>(null);
  const [state, setState] = useState<"connecting" | "live" | "offline">("connecting");
  useEffect(() => {
    let stopped = false; let socket: WebSocket | null = null; let retry: ReturnType<typeof setTimeout> | null = null; let attempt = 0;
    const close = () => { if (retry) clearTimeout(retry); retry = null; socket?.close(); socket = null; };
    const connect = () => {
      close(); if (stopped || AppState.currentState !== "active") return;
      setState("connecting"); socket = new WebSocket(socketUrl(ticker));
      socket.onopen = () => { attempt = 0; setState("live"); };
      socket.onmessage = (event) => { try { setLive({ ticker, quote: JSON.parse(event.data) as Quote }); } catch { /* Invalid ticks are ignored. */ } };
      socket.onerror = () => socket?.close();
      socket.onclose = () => { if (stopped || AppState.currentState !== "active") return; setState("offline"); attempt += 1; retry = setTimeout(connect, Math.min(30_000, 1_000 * (2 ** attempt))); };
    };
    const subscription = AppState.addEventListener("change", (next) => { if (next === "active") connect(); else { close(); setState("offline"); } });
    connect();
    return () => { stopped = true; subscription.remove(); close(); };
  }, [ticker]);
  return { quote: live?.ticker === ticker ? live.quote : initial, state };
}
