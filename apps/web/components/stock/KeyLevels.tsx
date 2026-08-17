import type { Technicals } from "@/lib/types";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";

export function KeyLevels({ technicals }: { technicals: Technicals }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const format = (value: number | null) => value == null ? "—" : new Intl.NumberFormat(localeFor(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return (
    <section className="panel info-card">
      <div className="section-title-row"><h2>{pick(language, "Niveaux clés", "Key levels")}</h2><span className="eyebrow">STRUCTURE</span></div>
      <div className="level-row"><span>{pick(language, "Résistance", "Resistance")}</span><strong className="negative">{format(technicals.resistance)}</strong></div>
      <div className="level-row"><span>Support</span><strong className="positive">{format(technicals.support)}</strong></div>
      <div className="level-row"><span>{pick(language, "Tendance", "Trend")}</span><strong>{language === "fr" ? technicals.trend : ({ Haussière: "Bullish", Baissière: "Bearish", Mixte: "Mixed" } as Record<string, string>)[technicals.trend] ?? technicals.trend}</strong></div>
    </section>
  );
}
