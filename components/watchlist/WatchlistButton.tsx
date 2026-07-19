"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeWatchlistSymbol, readWatchlist, toggleWatchlistTicker, WATCHLIST_EVENT } from "@/lib/watchlist";

export function WatchlistButton({ ticker }: { ticker: string }) {
  const symbol = normalizeWatchlistSymbol(ticker);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(readWatchlist().includes(symbol));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(WATCHLIST_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(WATCHLIST_EVENT, sync);
    };
  }, [symbol]);

  return (
    <button
      type="button"
      className={`watchlist-star ${active ? "is-active" : ""}`}
      onClick={() => setActive(toggleWatchlistTicker(symbol).includes(symbol))}
      aria-label={active ? `Retirer ${symbol} de la watchlist` : `Ajouter ${symbol} à la watchlist`}
      title={active ? "Retirer de la watchlist" : "Ajouter à la watchlist"}
    >
      <Star size={18} fill={active ? "currentColor" : "none"} />
      <span>{active ? "Suivie" : "Suivre"}</span>
    </button>
  );
}
