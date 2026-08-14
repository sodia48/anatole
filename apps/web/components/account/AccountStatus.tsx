"use client";

import Link from "next/link";
import { Cloud, CloudOff, LoaderCircle, UserRound } from "lucide-react";

import { useAccount } from "@/components/providers/AccountProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";

export function AccountStatus({ compact = false }: { compact?: boolean }) {
  const { user, hydrated, syncState } = useAccount();
  const { preferences } = usePreferences();
  const language = preferences.language;
  const Icon = !hydrated || syncState === "connecting" || syncState === "syncing"
    ? LoaderCircle
    : syncState === "offline" || syncState === "error"
      ? CloudOff
      : user
        ? Cloud
        : UserRound;
  const label = !hydrated
    ? pick(language, "Compte", "Account")
    : user
      ? syncState === "synced"
        ? pick(language, "Synchronisé", "Synced")
        : syncState === "offline"
          ? pick(language, "Hors ligne", "Offline")
          : syncState === "error"
            ? pick(language, "À vérifier", "Check")
            : pick(language, "Synchronisation", "Syncing")
      : pick(language, "Se connecter", "Sign in");

  return (
    <Link
      href="/parametres?section=account"
      className={`account-status${compact ? " is-compact" : ""}`}
      aria-label={user ? `${pick(language, "Compte", "Account")} ${user.email} · ${label}` : pick(language, "Ouvrir le compte Anatole", "Open Anatole account")}
    >
      <Icon size={17} className={syncState === "syncing" || syncState === "connecting" ? "is-spinning" : ""} />
      <span>{label}</span>
    </Link>
  );
}
