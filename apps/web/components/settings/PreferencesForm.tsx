"use client";

import {
  Check,
  RotateCcw,
} from "lucide-react";

import {
  usePreferences,
} from "@/components/providers/PreferencesProvider";
import {
  pick,
} from "@/lib/i18n";
import type {
  AnatoleDensity,
  AnatoleLanguage,
  AnatoleTheme,
  AnatoleTimeRange,
} from "@/lib/preferences";

export function PreferencesForm() {
  const {
    preferences,
    updatePreferences,
    resetPreferences,
  } = usePreferences();
  const language =
    preferences.language;

  const ranges: Array<{
    value: AnatoleTimeRange;
    label: string;
  }> = [
    {
      value: "1m",
      label: pick(
        language,
        "1 mois",
        "1 month",
      ),
    },
    {
      value: "3m",
      label: pick(
        language,
        "3 mois",
        "3 months",
      ),
    },
    {
      value: "6m",
      label: pick(
        language,
        "6 mois",
        "6 months",
      ),
    },
    {
      value: "1y",
      label: pick(
        language,
        "1 an",
        "1 year",
      ),
    },
    {
      value: "5y",
      label: pick(
        language,
        "5 ans",
        "5 years",
      ),
    },
  ];

  return (
    <div className="preferences-grid">
      <section className="panel preference-card preference-wide">
        <div className="preference-heading">
          <span className="eyebrow">
            {pick(
              language,
              "LANGUE",
              "LANGUAGE",
            )}
          </span>
          <h2>
            {pick(
              language,
              "Langue d’Anatole",
              "Anatole language",
            )}
          </h2>
          <p>
            {pick(
              language,
              "Choisis la langue de l’interface. Le réglage est mémorisé sur cet appareil et synchronisé avec ton compte.",
              "Choose the interface language. This setting is saved on this device and synchronized with your account.",
            )}
          </p>
        </div>

        <div className="universe-options">
          {(
            [
              [
                "fr",
                "FR",
                "Français",
                "Interface canadienne-française",
              ],
              [
                "en",
                "EN",
                "English",
                "Canadian English interface",
              ],
            ] as Array<
              [
                AnatoleLanguage,
                string,
                string,
                string,
              ]
            >
          ).map(
            ([
              value,
              badge,
              label,
              description,
            ]) => (
              <button
                key={value}
                type="button"
                className={`choice-card ${
                  language === value
                    ? "is-selected"
                    : ""
                }`}
                onClick={() =>
                  updatePreferences({
                    language: value,
                  })
                }
              >
                <span className="universe-logo">
                  {badge}
                </span>
                <span>
                  <strong>
                    {label}
                  </strong>
                  <small>
                    {description}
                  </small>
                </span>
                {language === value ? (
                  <Check size={17} />
                ) : null}
              </button>
            ),
          )}
        </div>
      </section>

      <section className="panel preference-card">
        <div className="preference-heading">
          <span className="eyebrow">
            {pick(
              language,
              "APPARENCE",
              "APPEARANCE",
            )}
          </span>
          <h2>
            {pick(
              language,
              "Thème Anatole",
              "Anatole theme",
            )}
          </h2>
          <p>
            {pick(
              language,
              "Le mode sombre reste le thème principal. Le thème bleu accentue les surfaces et les repères.",
              "Dark mode remains the primary theme. The blue theme emphasizes surfaces and financial markers.",
            )}
          </p>
        </div>

        <div className="choice-grid two-columns">
          {(
            [
              "dark",
              "blue",
            ] as AnatoleTheme[]
          ).map((theme) => (
            <button
              key={theme}
              type="button"
              className={`choice-card ${
                preferences.theme === theme
                  ? "is-selected"
                  : ""
              }`}
              onClick={() =>
                updatePreferences({
                  theme,
                })
              }
            >
              <span
                className={`theme-preview theme-preview-${theme}`}
              >
                <i />
                <i />
                <i />
              </span>
              <span>
                <strong>
                  {theme === "dark"
                    ? pick(
                        language,
                        "Sombre",
                        "Dark",
                      )
                    : pick(
                        language,
                        "Bleu",
                        "Blue",
                      )}
                </strong>
                <small>
                  {theme === "dark"
                    ? pick(
                        language,
                        "Contraste maximal",
                        "Maximum contrast",
                      )
                    : pick(
                        language,
                        "Accent financier bleu",
                        "Blue financial accent",
                      )}
                </small>
              </span>
              {preferences.theme ===
              theme ? (
                <Check size={17} />
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="panel preference-card">
        <div className="preference-heading">
          <span className="eyebrow">
            {pick(
              language,
              "DENSITÉ",
              "DENSITY",
            )}
          </span>
          <h2>
            {pick(
              language,
              "Espacement de l’interface",
              "Interface spacing",
            )}
          </h2>
          <p>
            {pick(
              language,
              "La densité compacte réduit les marges sans diminuer la lisibilité des données.",
              "Compact density reduces spacing without sacrificing data readability.",
            )}
          </p>
        </div>

        <div className="segmented-control">
          {(
            [
              "comfortable",
              "compact",
            ] as AnatoleDensity[]
          ).map((density) => (
            <button
              key={density}
              type="button"
              className={
                preferences.density ===
                density
                  ? "is-selected"
                  : ""
              }
              onClick={() =>
                updatePreferences({
                  density,
                })
              }
            >
              {density ===
              "comfortable"
                ? pick(
                    language,
                    "Confortable",
                    "Comfortable",
                  )
                : pick(
                    language,
                    "Compacte",
                    "Compact",
                  )}
            </button>
          ))}
        </div>
      </section>

      <section className="panel preference-card">
        <div className="preference-heading">
          <span className="eyebrow">
            {pick(
              language,
              "DONNÉES",
              "DATA",
            )}
          </span>
          <h2>
            {pick(
              language,
              "Affichage numérique",
              "Number display",
            )}
          </h2>
          <p>
            {pick(
              language,
              "Choisis le nombre de décimales utilisées pour les prix et variations.",
              "Choose how many decimals are used for prices and changes.",
            )}
          </p>
        </div>

        <div className="segmented-control">
          {[2, 3].map(
            (decimals) => (
              <button
                key={decimals}
                type="button"
                className={
                  preferences.decimals ===
                  decimals
                    ? "is-selected"
                    : ""
                }
                onClick={() =>
                  updatePreferences({
                    decimals:
                      decimals as 2 | 3,
                  })
                }
              >
                {decimals}{" "}
                {pick(
                  language,
                  "décimales",
                  "decimals",
                )}
              </button>
            ),
          )}
        </div>
      </section>

      <section className="panel preference-card">
        <div className="preference-heading">
          <span className="eyebrow">
            FOCUS
          </span>
          <h2>
            {pick(
              language,
              "Période par défaut",
              "Default period",
            )}
          </h2>
          <p>
            {pick(
              language,
              "Cette préférence est utilisée par les graphiques professionnels compatibles.",
              "This preference is used by compatible professional charts.",
            )}
          </p>
        </div>

        <div className="range-options">
          {ranges.map((range) => (
            <button
              key={range.value}
              type="button"
              className={
                preferences.defaultRange ===
                range.value
                  ? "is-selected"
                  : ""
              }
              onClick={() =>
                updatePreferences({
                  defaultRange:
                    range.value,
                })
              }
            >
              {range.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel preference-card preference-wide">
        <div className="preference-heading">
          <span className="eyebrow">
            {pick(
              language,
              "UNIVERS",
              "UNIVERSE",
            )}
          </span>
          <h2>
            {pick(
              language,
              "Marché par défaut",
              "Default market",
            )}
          </h2>
          <p>
            {pick(
              language,
              "Choisis l’univers affiché en priorité dans Anatole. Le choix est aussi synchronisé avec ton compte.",
              "Choose the market universe shown first in Anatole. This choice is also synchronized with your account.",
            )}
          </p>
        </div>

        <div className="universe-options">
          <button
            type="button"
            className={`choice-card ${
              preferences.defaultUniverse ===
              "tsx60"
                ? "is-selected"
                : ""
            }`}
            onClick={() =>
              updatePreferences({
                defaultUniverse:
                  "tsx60",
              })
            }
          >
            <span className="universe-logo">
              60
            </span>
            <span>
              <strong>TSX 60</strong>
              <small>
                {pick(
                  language,
                  "Grandes capitalisations canadiennes",
                  "Large Canadian companies",
                )}
              </small>
            </span>
            {preferences.defaultUniverse ===
            "tsx60" ? (
              <Check size={17} />
            ) : null}
          </button>

          <button
            type="button"
            className={`choice-card ${
              preferences.defaultUniverse ===
              "composite"
                ? "is-selected"
                : ""
            }`}
            onClick={() =>
              updatePreferences({
                defaultUniverse:
                  "composite",
              })
            }
          >
            <span className="universe-logo">
              C
            </span>
            <span>
              <strong>
                TSX Composite
              </strong>
              <small>
                {pick(
                  language,
                  "Marché canadien élargi",
                  "Broader Canadian market",
                )}
              </small>
            </span>
            {preferences.defaultUniverse ===
            "composite" ? (
              <Check size={17} />
            ) : null}
          </button>
        </div>
      </section>

      <div className="preferences-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={resetPreferences}
        >
          <RotateCcw size={16} />
          {pick(
            language,
            "Réinitialiser",
            "Reset",
          )}
        </button>
        <span>
          {pick(
            language,
            "Les préférences sont sauvegardées sur cet appareil et synchronisées lorsqu’un compte Anatole est connecté.",
            "Preferences are saved on this device and synchronized when an Anatole account is connected.",
          )}
        </span>
      </div>
    </div>
  );
}
