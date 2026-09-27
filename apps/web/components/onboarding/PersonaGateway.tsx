"use client";

import { Building2, ChevronRight, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";

import styles from "./PersonaGateway.module.css";

const PERSONA_KEY = "anatole:persona:v1";

type Persona = "particulier" | "institutionnel";

export function PersonaGateway() {
  const router = useRouter();
  const { preferences } = usePreferences();
  const language = preferences.language;

  const choose = (persona: Persona) => {
    try {
      window.localStorage.setItem(PERSONA_KEY, persona);
    } catch {
      // Le choix reste utilisable même si le stockage est bloqué.
    }

    router.push(
      persona === "institutionnel"
        ? "/institutionnel"
        : "/aujourdhui",
    );
  };

  return (
    <section
      className={styles.overlay}
      data-testid="persona-gateway"
      aria-labelledby="persona-gateway-title"
    >
      <div className={styles.backdropGrid} aria-hidden="true" />

      <div className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.brand}>ANATOLE</span>
          <span className={styles.eyebrow}>
            {pick(
              language,
              "CHOISIS TON ENVIRONNEMENT",
              "CHOOSE YOUR ENVIRONMENT",
            )}
          </span>
          <h1 id="persona-gateway-title">
            {pick(
              language,
              "Comment veux-tu utiliser Anatole aujourd'hui ?",
              "How do you want to use Anatole today?",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Les deux univers restent accessibles. Ce choix détermine simplement le cockpit d'entrée.",
              "Both universes remain accessible. This choice only determines your starting cockpit.",
            )}
          </p>
        </header>

        <div className={styles.choices}>
          <button
            type="button"
            data-testid="persona-particulier"
            className={styles.choice}
            onClick={() => choose("particulier")}
          >
            <span className={styles.icon}>
              <UserRound size={28} />
            </span>
            <span className={styles.copy}>
              <small>
                {pick(language, "PARTICULIER", "INDIVIDUAL")}
              </small>
              <strong>
                {pick(
                  language,
                  "Anatole Personnel",
                  "Anatole Personal",
                )}
              </strong>
              <span>
                {pick(
                  language,
                  "Marchés, portefeuille, Anatole Conseil, objectifs, scénarios et finances personnelles.",
                  "Markets, portfolio, Anatole Advisor, goals, scenarios and personal finance.",
                )}
              </span>
            </span>
            <ChevronRight size={22} />
          </button>

          <button
            type="button"
            data-testid="persona-institutionnel"
            className={`${styles.choice} ${styles.institutional}`}
            onClick={() => choose("institutionnel")}
          >
            <span className={styles.icon}>
              <Building2 size={28} />
            </span>
            <span className={styles.copy}>
              <small>INSTITUTIONNEL</small>
              <strong>Anatole Institutional</strong>
              <span>
                {pick(
                  language,
                  "Portefeuille institutionnel, risque, recherche, comité d'investissement, wealth et infrastructure entreprise.",
                  "Institutional portfolio, risk, research, investment committee, wealth and enterprise infrastructure.",
                )}
              </span>
            </span>
            <ChevronRight size={22} />
          </button>
        </div>

        <footer className={styles.footer}>
          <span>
            {pick(
              language,
              "Tu pourras changer de mode à tout moment depuis la navigation.",
              "You can switch mode at any time from navigation.",
            )}
          </span>
          <span>Personal intelligence + Institutional intelligence</span>
        </footer>
      </div>
    </section>
  );
}
