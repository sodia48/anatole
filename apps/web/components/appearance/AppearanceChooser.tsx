"use client";

import { Check } from "lucide-react";

import { pick } from "@/lib/i18n";
import type { AnatoleLanguage, AnatoleTheme } from "@/lib/preferences";

type Props = {
  language: AnatoleLanguage;
  theme: AnatoleTheme;
  onSelect: (theme: AnatoleTheme) => void;
  onConfirm?: () => void;
  modal?: boolean;
};

const choices: Array<{ theme: AnatoleTheme; labelFr: string; labelEn: string; detailFr: string; detailEn: string }> = [
  { theme: "dark", labelFr: "Anatole Original", labelEn: "Anatole Original", detailFr: "Bleu nuit · contraste maximal", detailEn: "Midnight blue · maximum contrast" },
  { theme: "blue", labelFr: "Anatole Ciel", labelEn: "Anatole Sky", detailFr: "Bleu ciel · lumineux et épuré", detailEn: "Sky blue · bright and refined" },
];

function CockpitPreview({ value }: { value: AnatoleTheme }) {
  return (
    <span className={`anatole-preview anatole-preview-${value}`} aria-hidden="true">
      <span className="anatole-preview-bar"><i /><i /></span>
      <span className="anatole-preview-kpis"><i /><i /><i /></span>
      <span className="anatole-preview-market"><i /><i /><i /><i /><i /></span>
    </span>
  );
}

export function AppearanceChooser({ language, theme, onSelect, onConfirm, modal = false }: Props) {
  return (
    <div className={modal ? "appearance-chooser appearance-chooser-modal" : "appearance-chooser"}>
      <div className="appearance-copy">
        <span className="eyebrow">{pick(language, "APPARENCE", "APPEARANCE")}</span>
        <h2>{pick(language, "Choisis ton Anatole", "Choose your Anatole")}</h2>
        <p>{pick(language, "Deux identités, la même intelligence financière.", "Two identities, the same financial intelligence.")}</p>
      </div>
      <div className="appearance-options" role="radiogroup" aria-label={pick(language, "Thème Anatole", "Anatole theme")}>
        {choices.map((choice) => {
          const selected = theme === choice.theme;
          return (
            <button
              type="button"
              className={`appearance-option${selected ? " is-selected" : ""}`}
              key={choice.theme}
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(choice.theme)}
              data-testid={`appearance-${choice.theme}`}
            >
              <CockpitPreview value={choice.theme} />
              <span className="appearance-label">
                <strong>{pick(language, choice.labelFr, choice.labelEn)}</strong>
                <small>{pick(language, choice.detailFr, choice.detailEn)}</small>
              </span>
              <span className="appearance-check" aria-hidden="true">{selected ? <Check size={18} /> : null}</span>
            </button>
          );
        })}
      </div>
      {onConfirm ? (
        <button type="button" className="appearance-confirm" onClick={onConfirm}>
          {pick(language, "Continuer avec ce thème", "Continue with this theme")}
        </button>
      ) : null}
    </div>
  );
}
