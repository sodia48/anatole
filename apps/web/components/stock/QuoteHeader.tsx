import type { Quote } from "@/lib/types";

const number = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 });

export function QuoteHeader({ quote, liveState }: { quote: Quote; liveState: "connecting" | "live" | "offline" }) {
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
      <div className="quote-meta">
        <span className={`live-pill ${liveState}`}>{liveState === "live" ? "LIVE" : liveState === "connecting" ? "CONNEXION" : "REPLI"}</span>
        <span>Volume {compact.format(quote.volume)}</span>
        <span>{quote.delayed ? "Donnée potentiellement différée" : "Flux disponible"}</span>
      </div>
    </header>
  );
}
