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

const sections: SectionDefinition[] = [
  {
    id: "account",
    label: "Compte & synchronisation",
    title: "Compte et sécurité",
    description:
      "Gère ton profil, tes sessions, l’export de tes données et la synchronisation multiappareil.",
    icon: UserRound,
  },
  {
    id: "preferences",
    label: "Préférences",
    title: "Expérience Anatole",
    description:
      "Personnalise l’apparence, la densité, l’univers de marché et les réglages d’affichage.",
    icon: SlidersHorizontal,
  },
  {
    id: "quality",
    label: "Qualité des données",
    title: "Données et fiabilité",
    description:
      "Contrôle la fraîcheur des sources, la couverture, les erreurs et la santé du pipeline Anatole.",
    icon: ShieldCheck,
  },
];

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
  const activeSection = normalizeSection(searchParams.get("section"));
  const activeDefinition = sections.find((item) => item.id === activeSection) ?? sections[0];

  const accountStatus = useMemo(() => {
    if (!account.hydrated) return "Chargement";
    if (!account.user) return "Mode local";
    if (account.syncState === "offline") return "Hors ligne";
    if (account.syncState === "error") return "À vérifier";
    if (account.syncState === "syncing" || account.syncState === "connecting") {
      return "Synchronisation";
    }
    return "Synchronisé";
  }, [account.hydrated, account.syncState, account.user]);

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
          <span className={styles.eyebrow}>CENTRE DE CONTRÔLE · v0.9.3</span>
          <h1>Compte et paramètres</h1>
          <p>
            Un espace unique pour ton compte, la synchronisation, les préférences
            et la qualité des données Anatole.
          </p>
        </div>
        <div className={styles.heroStatus}>
          <span className={styles.statusIcon}>
            <SyncIcon size={22} />
          </span>
          <div>
            <small>État du compte</small>
            <strong>{accountStatus}</strong>
            <span>{account.user?.email ?? "Données conservées sur cet appareil"}</span>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.navigation} aria-label="Paramètres Anatole">
          <div className={styles.navigationHeading}>
            <span className={styles.navigationMark}>
              <Settings2 size={20} />
            </span>
            <div>
              <strong>Paramètres</strong>
              <small>Gestion centralisée</small>
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
                {preferences.theme === "blue" ? "Thème bleu" : "Thème sombre"} · {preferences.density === "compact" ? "Compact" : "Confortable"}
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
