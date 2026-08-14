"use client";

import {
  ChevronRight,
  Cloud,
  CloudOff,
  DatabaseZap,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { AccountClient } from "@/components/account/AccountClient";
import { useAccount } from "@/components/providers/AccountProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { PreferencesForm } from "@/components/settings/PreferencesForm";
import { pick } from "@/lib/i18n";
import { DataQualityClient } from "@/components/workspace/DataQualityClient";

import styles from "./SettingsHub.module.css";

type SettingsSection = "account" | "preferences" | "quality";

type SectionDefinition = {
  id: SettingsSection;
  label: string;
  title: string;
  description: string;
  icon: typeof UserRound;
};

function settingsSections(
  language: "fr" | "en",
): SectionDefinition[] {
  return [
    {
      id: "account",
      label: pick(
        language,
        "Compte & synchronisation",
        "Account & sync",
      ),
      title: pick(
        language,
        "Compte et sécurité",
        "Account & security",
      ),
      description: pick(
        language,
        "Gère ton profil, tes sessions, l’export de tes données et la synchronisation multiappareil.",
        "Manage your profile, sessions, data export and multi-device synchronization.",
      ),
      icon: UserRound,
    },
    {
      id: "preferences",
      label: pick(
        language,
        "Préférences",
        "Preferences",
      ),
      title: pick(
        language,
        "Expérience Anatole",
        "Anatole experience",
      ),
      description: pick(
        language,
        "Personnalise l’apparence, la densité, l’univers de marché, la langue et les réglages d’affichage.",
        "Customize appearance, density, market universe, language and display settings.",
      ),
      icon: SlidersHorizontal,
    },
    {
      id: "quality",
      label: pick(
        language,
        "Qualité des données",
        "Data quality",
      ),
      title: pick(
        language,
        "Données et fiabilité",
        "Data & reliability",
      ),
      description: pick(
        language,
        "Contrôle la fraîcheur des sources, la couverture, les erreurs et la santé du pipeline Anatole.",
        "Review source freshness, coverage, errors and the health of the Anatole data pipeline.",
      ),
      icon: ShieldCheck,
    },
  ];
}


function normalizeSection(value: string | null): SettingsSection {
  if (value === "preferences" || value === "quality") {
    return value;
  }

  return "account";
}

export function SettingsHubClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const account = useAccount();
  const { preferences } = usePreferences();
  const language = preferences.language;
  const sections = useMemo(
    () => settingsSections(language),
    [language],
  );
  const activeSection = normalizeSection(searchParams.get("section"));
  const activeDefinition = sections.find((item) => item.id === activeSection) ?? sections[0];

  const accountStatus = useMemo(() => {
    if (!account.hydrated) return pick(language, "Chargement", "Loading");
    if (!account.user) return pick(language, "Mode local", "Local mode");
    if (account.syncState === "offline") return pick(language, "Hors ligne", "Offline");
    if (account.syncState === "error") return pick(language, "À vérifier", "Check required");
    if (account.syncState === "syncing" || account.syncState === "connecting") {
      return pick(language, "Synchronisation", "Synchronizing");
    }
    return pick(language, "Synchronisé", "Synced");
  }, [account.hydrated, account.syncState, account.user, language]);

  function selectSection(section: SettingsSection): void {
    router.replace(`/parametres?section=${section}`, { scroll: false });
  }

  const HeaderIcon = activeDefinition.icon;
  const SyncIcon =
    account.syncState === "offline" || account.syncState === "error"
      ? CloudOff
      : Cloud;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{pick(language, "CENTRE DE CONTRÔLE", "CONTROL CENTER")} · v1.3.6</span>
          <h1>{pick(language, "Compte et paramètres", "Account & settings")}</h1>
          <p>
            {pick(
              language,
              "Un espace unique pour ton compte, la synchronisation, les préférences et la qualité des données Anatole.",
              "One place for your account, synchronization, preferences and Anatole data quality.",
            )}
          </p>
        </div>
        <div className={styles.heroStatus}>
          <span className={styles.statusIcon}>
            <SyncIcon size={22} />
          </span>
          <div>
            <small>{pick(language, "État du compte", "Account status")}</small>
            <strong>{accountStatus}</strong>
            <span>{account.user?.email ?? pick(language, "Données conservées sur cet appareil", "Data stored on this device")}</span>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.navigation} aria-label={pick(language, "Paramètres Anatole", "Anatole settings")}>
          <div className={styles.navigationHeading}>
            <span className={styles.navigationMark}>
              <Settings2 size={20} />
            </span>
            <div>
              <strong>{pick(language, "Paramètres", "Settings")}</strong>
              <small>{pick(language, "Gestion centralisée", "Centralized management")}</small>
            </div>
          </div>

          <nav className={styles.navigationList}>
            {sections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;

              return (
                <button
                  key={section.id}
                  type="button"
                  className={active ? styles.activeNavigationItem : styles.navigationItem}
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectSection(section.id)}
                >
                  <span className={styles.navigationIcon}>
                    <Icon size={19} />
                  </span>
                  <span className={styles.navigationText}>
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </span>
                  <ChevronRight size={17} className={styles.navigationArrow} />
                </button>
              );
            })}
          </nav>

          <div className={styles.navigationSummary}>
            <DatabaseZap size={18} />
            <div>
              <strong>{preferences.defaultUniverse === "composite" ? "TSX Composite" : "TSX 60"}</strong>
              <span>
                {preferences.theme === "blue" ? pick(language, "Thème bleu", "Blue theme") : pick(language, "Thème sombre", "Dark theme")} · {preferences.density === "compact" ? "Compact" : pick(language, "Confortable", "Comfortable")} · {language === "en" ? "EN" : "FR"}
              </span>
            </div>
          </div>
        </aside>

        <main className={styles.content}>
          <div className={styles.contentHeader}>
            <span className={styles.contentIcon}>
              <HeaderIcon size={24} />
            </span>
            <div>
              <span className={styles.eyebrow}>{activeDefinition.label.toUpperCase()}</span>
              <h2>{activeDefinition.title}</h2>
              <p>{activeDefinition.description}</p>
            </div>
          </div>

          <div className={styles.contentBody}>
            {activeSection === "account" ? <AccountClient embedded /> : null}
            {activeSection === "preferences" ? <PreferencesForm /> : null}
            {activeSection === "quality" ? <DataQualityClient embedded /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
