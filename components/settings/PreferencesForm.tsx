"use client";

import { Check, RotateCcw } from "lucide-react";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { AnatoleDensity, AnatoleTheme, AnatoleTimeRange } from "@/lib/preferences";

const ranges: Array<{ value: AnatoleTimeRange; label: string }> = [
  { value: "1m", label: "1 mois" },
  { value: "3m", label: "3 mois" },
  { value: "6m", label: "6 mois" },
  { value: "1y", label: "1 an" },
  { value: "5y", label: "5 ans" },
];

export function PreferencesForm() {
  const { preferences, updatePreferences, resetPreferences } = usePreferences();

  return (
    <div className="preferences-grid">
      <section className="panel preference-card">
        <div className="preference-heading"><span className="eyebrow">APPARENCE</span><h2>Thème Anatole</h2><p>Le mode sombre reste le thème principal. Le thème bleu accentue les surfaces et les repères.</p></div>
        <div className="choice-grid two-columns">
          {(["dark", "blue"] as AnatoleTheme[]).map((theme) => (
            <button key={theme} type="button" className={`choice-card ${preferences.theme === theme ? "is-selected" : ""}`} onClick={() => updatePreferences({ theme })}>
              <span className={`theme-preview theme-preview-${theme}`}><i /><i /><i /></span>
              <span><strong>{theme === "dark" ? "Sombre" : "Bleu"}</strong><small>{theme === "dark" ? "Contraste maximal" : "Accent financier bleu"}</small></span>
              {preferences.theme === theme ? <Check size={17} /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="panel preference-card">
        <div className="preference-heading"><span className="eyebrow">DENSITÉ</span><h2>Espacement de l’interface</h2><p>La densité compacte réduit les marges sans diminuer la lisibilité des données.</p></div>
        <div className="segmented-control">
          {(["comfortable", "compact"] as AnatoleDensity[]).map((density) => (
            <button key={density} type="button" className={preferences.density === density ? "is-selected" : ""} onClick={() => updatePreferences({ density })}>
              {density === "comfortable" ? "Confortable" : "Compacte"}
            </button>
          ))}
        </div>
      </section>

      <section className="panel preference-card">
        <div className="preference-heading"><span className="eyebrow">DONNÉES</span><h2>Affichage numérique</h2><p>Choisis le nombre de décimales utilisées pour les prix et variations.</p></div>
        <div className="segmented-control">
          {[2, 3].map((decimals) => (
            <button key={decimals} type="button" className={preferences.decimals === decimals ? "is-selected" : ""} onClick={() => updatePreferences({ decimals: decimals as 2 | 3 })}>
              {decimals} décimales
            </button>
          ))}
        </div>
      </section>

      <section className="panel preference-card">
        <div className="preference-heading"><span className="eyebrow">FOCUS</span><h2>Période par défaut</h2><p>Cette préférence sera branchée au graphique professionnel lors de la prochaine migration Focus.</p></div>
        <div className="range-options">
          {ranges.map((range) => (
            <button key={range.value} type="button" className={preferences.defaultRange === range.value ? "is-selected" : ""} onClick={() => updatePreferences({ defaultRange: range.value })}>
              {range.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel preference-card preference-wide">
        <div className="preference-heading"><span className="eyebrow">UNIVERS</span><h2>Marché par défaut</h2><p>Le TSX 60 est actif. Le TSX Composite sera ajouté au moteur de données lors de la phase Marchés.</p></div>
        <div className="universe-options">
          <button type="button" className="choice-card is-selected"><span className="universe-logo">60</span><span><strong>TSX 60</strong><small>Actif maintenant</small></span><Check size={17} /></button>
          <button type="button" className="choice-card" disabled><span className="universe-logo">C</span><span><strong>TSX Composite</strong><small>Préparation v0.5</small></span></button>
        </div>
      </section>

      <div className="preferences-actions">
        <button type="button" className="secondary-button" onClick={resetPreferences}><RotateCcw size={16} />Réinitialiser</button>
        <span>Les préférences sont sauvegardées automatiquement dans ce navigateur.</span>
      </div>
    </div>
  );
}
