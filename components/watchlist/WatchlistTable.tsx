"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { Quote } from "@/lib/types";

const price = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 });

export function WatchlistTable({ items, onRemove }: { items: Quote[]; onRemove: (ticker: string) => void }) {
  return (
    <div className="watchlist-table-wrap panel">
      <div className="watchlist-table-head" aria-hidden="true">
        <span>Titre</span><span>Prix</span><span>Variation</span><span>Jour</span><span>Volume</span><span />
      </div>
      <div className="watchlist-rows">
        {items.map((item) => {
          const positive = item.change_percent >= 0;
          const focusTicker = item.symbol.replace(/-/g, ".");
          return (
            <article className="watchlist-row" key={item.ticker}>
              <Link className="watchlist-row-link" href={`/focus/${encodeURIComponent(focusTicker)}`} aria-label={`Ouvrir ${item.symbol} dans Focus`}>
                <div className="watchlist-instrument">
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </div>
                <div className="watchlist-cell"><small>Prix</small><strong>{price.format(item.price)} {item.currency}</strong></div>
                <div className={`watchlist-cell ${positive ? "positive" : "negative"}`}>
                  <small>Variation</small><strong>{positive ? "+" : ""}{price.format(item.change_percent)}%</strong><span>{positive ? "+" : ""}{price.format(item.change)}</span>
                </div>
                <div className="watchlist-cell"><small>Jour</small><strong>{price.format(item.day_low)} – {price.format(item.day_high)}</strong></div>
                <div className="watchlist-cell"><small>Volume</small><strong>{compact.format(item.volume)}</strong></div>
              </Link>
              <button type="button" className="watchlist-remove" onClick={() => onRemove(item.ticker)} aria-label={`Retirer ${item.symbol}`} title="Retirer">
                <Trash2 size={17} />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
