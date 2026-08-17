import type { Quote } from "@/lib/types";
import { WatchlistButton } from "@/components/watchlist/WatchlistButton";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";

export function QuoteHeader({ quote, liveState }: { quote: Quote; liveState: "connecting" | "live" | "offline" }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const number = new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(localeFor(language), { notation: "compact", maximumFractionDigits: 1 });
  const positive = quote.change >= 0;
  return (
    <header className="quote-header panel">
      <div>
        <div className="instrument-line">
          <span className="ticker-badge">{quote.symbol}</span>
          <span>{quote.name}</span>
          <span className="muted">{quote.exchange}</span>
        </div>
        <div className="price-line">
          <strong>{number.format(quote.price)} {quote.currency}</strong>
          <span className={positive ? "positive" : "negative"}>
            {positive ? "+" : ""}{number.format(quote.change)} ({positive ? "+" : ""}{number.format(quote.change_percent)} %)
          </span>
        </div>
      </div>
      <div className="quote-actions">
        <WatchlistButton ticker={quote.ticker} />
        <div className="quote-meta">
          <span className={`live-pill ${liveState}`}>{liveState === "live" ? "LIVE" : liveState === "connecting" ? pick(language, "CONNEXION", "CONNECTING") : pick(language, "REPLI", "FALLBACK")}</span>
          <span>Volume {compact.format(quote.volume)}</span>
          <span>{quote.delayed ? pick(language, "Donnée potentiellement différée", "Potentially delayed data") : pick(language, "Flux disponible", "Feed available")}</span>
        </div>
      </div>
    </header>
  );
}
