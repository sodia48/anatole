import type { Technicals } from "@/lib/types";

const format = (value: number | null) => value == null ? "—" : new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function KeyLevels({ technicals }: { technicals: Technicals }) {
  return (
    <section className="panel info-card">
      <div className="section-title-row"><h2>Niveaux clés</h2><span className="eyebrow">STRUCTURE</span></div>
      <div className="level-row"><span>Résistance</span><strong className="negative">{format(technicals.resistance)}</strong></div>
      <div className="level-row"><span>Support</span><strong className="positive">{format(technicals.support)}</strong></div>
      <div className="level-row"><span>Tendance</span><strong>{technicals.trend}</strong></div>
    </section>
  );
}
