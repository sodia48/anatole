"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { Quote } from "@/lib/types";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";

export function WatchlistTable({ items, onRemove }: { items: Quote[]; onRemove: (ticker: string) => void }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const price = new Intl.NumberFormat(localeFor(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(localeFor(language), { notation: "compact", maximumFractionDigits: 1 });
  return (
    <div className="watchlist-table-wrap panel">
      <div className="watchlist-table-head" aria-hidden="true">
        <span>{pick(language, "Titre", "Security")}</span><span>{pick(language, "Prix", "Price")}</span><span>{pick(language, "Variation", "Change")}</span><span>{pick(language, "Jour", "Day")}</span><span>Volume</span><span />
      </div>
      <div className="watchlist-rows">
        {items.map((item) => {
          const positive = item.change_percent >= 0;
          const focusTicker = item.symbol.replace(/-/g, ".");
          return (
            <article className="watchlist-row" key={item.ticker}>
              <Link className="watchlist-row-link" href={`/focus/${encodeURIComponent(focusTicker)}`} aria-label={pick(language, `Ouvrir ${item.symbol} dans Focus`, `Open ${item.symbol} in Focus`)}>
                <div className="watchlist-instrument">
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </div>
                <div className="watchlist-cell"><small>{pick(language, "Prix", "Price")}</small><strong>{price.format(item.price)} {item.currency}</strong></div>
                <div className={`watchlist-cell ${positive ? "positive" : "negative"}`}>
                  <small>{pick(language, "Variation", "Change")}</small><strong>{positive ? "+" : ""}{price.format(item.change_percent)}%</strong><span>{positive ? "+" : ""}{price.format(item.change)}</span>
                </div>
                <div className="watchlist-cell"><small>{pick(language, "Jour", "Day")}</small><strong>{price.format(item.day_low)} – {price.format(item.day_high)}</strong></div>
                <div className="watchlist-cell"><small>Volume</small><strong>{compact.format(item.volume)}</strong></div>
              </Link>
              <button type="button" className="watchlist-remove" onClick={() => onRemove(item.ticker)} aria-label={pick(language, `Retirer ${item.symbol}`, `Remove ${item.symbol}`)} title={pick(language, "Retirer", "Remove")}>
                <Trash2 size={17} />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
