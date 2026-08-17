import type { Technicals } from "@/lib/types";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";

export function TechnicalSummary({ technicals }: { technicals: Technicals }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const format = (value: number | null) => value == null ? "—" : new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 2 }).format(value);
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
      <div className="section-title-row"><h2>{pick(language, "Technique", "Technicals")}</h2><span className="eyebrow">{pick(language, "AUTOMATIQUE", "AUTOMATIC")}</span></div>
      <div className="metrics-grid">
        {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>
  );
}
