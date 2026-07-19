import type { Technicals } from "@/lib/types";

const format = (value: number | null) => value == null ? "—" : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value);

export function TechnicalSummary({ technicals }: { technicals: Technicals }) {
  const metrics = [
    ["RSI 14", format(technicals.rsi_14)],
    ["MACD", format(technicals.macd)],
    ["Signal MACD", format(technicals.macd_signal)],
    ["SMA 20", format(technicals.sma_20)],
    ["SMA 50", format(technicals.sma_50)],
    ["SMA 200", format(technicals.sma_200)],
  ];
  return (
    <section className="panel info-card">
      <div className="section-title-row"><h2>Technique</h2><span className="eyebrow">AUTOMATIQUE</span></div>
      <div className="metrics-grid">
        {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>
  );
}
