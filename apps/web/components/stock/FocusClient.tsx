"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyLevels } from "./KeyLevels";
import { QuoteHeader } from "./QuoteHeader";
import { TechnicalSummary } from "./TechnicalSummary";
import { TradingChart } from "@/components/chart/TradingChart";
import { quoteWebSocketUrl } from "@/lib/api";
import type { FocusSnapshot, Quote } from "@/lib/types";

export function FocusClient({ initialSnapshot }: { initialSnapshot: FocusSnapshot }) {
  const [quote, setQuote] = useState<Quote>(initialSnapshot.quote);
  const [liveState, setLiveState] = useState<"connecting" | "live" | "offline">("connecting");
  const wsUrl = useMemo(() => quoteWebSocketUrl(initialSnapshot.quote.ticker), [initialSnapshot.quote.ticker]);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      setLiveState("connecting");
      socket = new WebSocket(wsUrl);
      socket.onopen = () => setLiveState("live");
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as Quote;
        setQuote(payload);
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (stopped) return;
        setLiveState("offline");
        retry = setTimeout(connect, 3500);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [wsUrl]);

  return (
    <div className="focus-page">
      <QuoteHeader quote={quote} liveState={liveState} />
      <div className="focus-grid">
        <TradingChart candles={initialSnapshot.history} technicals={initialSnapshot.technicals} />
        <aside className="right-column">
          <section className="panel info-card profile-card">
            <div className="section-title-row"><h2>{initialSnapshot.profile.name}</h2><span className="eyebrow">{initialSnapshot.profile.exchange}</span></div>
            <p>{initialSnapshot.profile.description ?? "Profil détaillé disponible lors du branchement des données Anatole."}</p>
            <div className="profile-tags"><span>{initialSnapshot.profile.sector ?? "Marché canadien"}</span><span>{initialSnapshot.profile.industry ?? "Titre coté"}</span></div>
          </section>
          <TechnicalSummary technicals={initialSnapshot.technicals} />
          <KeyLevels technicals={initialSnapshot.technicals} />
        </aside>
      </div>
      <footer className="status-footer">Généré à {new Date(initialSnapshot.generated_at).toLocaleString("fr-CA")} · Source {quote.source}</footer>
    </div>
  );
}
