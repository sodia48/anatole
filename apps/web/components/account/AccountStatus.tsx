"use client";

import Link from "next/link";
import { Cloud, CloudOff, LoaderCircle, UserRound } from "lucide-react";

import { useAccount } from "@/components/providers/AccountProvider";

export function AccountStatus({ compact = false }: { compact?: boolean }) {
  const { user, hydrated, syncState } = useAccount();
  const Icon = !hydrated || syncState === "connecting" || syncState === "syncing"
    ? LoaderCircle
    : syncState === "offline" || syncState === "error"
      ? CloudOff
      : user
        ? Cloud
        : UserRound;
  const label = !hydrated
    ? "Compte"
    : user
      ? syncState === "synced"
        ? "Synchronisé"
        : syncState === "offline"
          ? "Hors ligne"
          : syncState === "error"
            ? "À vérifier"
            : "Synchronisation"
      : "Se connecter";

  return (
    <Link
      href="/compte"
      className={`account-status${compact ? " is-compact" : ""}`}
      aria-label={user ? `Compte ${user.email} · ${label}` : "Ouvrir le compte Anatole"}
    >
      <Icon size={17} className={syncState === "syncing" || syncState === "connecting" ? "is-spinning" : ""} />
      <span>{label}</span>
    </Link>
  );
}
