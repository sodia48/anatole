"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCog,
  UserRound,
} from "lucide-react";

import { useAccount } from "@/components/providers/AccountProvider";
import {
  changeAccountPassword,
  exportAccountData,
  updateAccountProfile,
} from "@/lib/account";
import { readLocalWorkspace } from "@/lib/workspace-sync";

import styles from "./Account.module.css";

type Mode = "login" | "register";

function dateLabel(value: string | null): string {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AccountClient({ embedded = false }: { embedded?: boolean }) {
  const account = useAccount();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    setProfileName(account.user?.display_name ?? "");
  }, [account.user?.display_name]);

  const counts = useMemo(() => {
    if (!account.hydrated) return null;
    const data = readLocalWorkspace().data;
    return {
      watchlist: data.watchlist.length,
      portfolio: data.portfolio.length,
      alerts: data.alerts.length,
      comparator: data.comparator_symbols.length,
    };
  }, [account.hydrated, account.lastSyncedAt, account.workspaceRevision]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (mode === "register") {
        await account.register(email, password, displayName || undefined);
      } else {
        await account.signIn(email, password);
      }
      setPassword("");
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Opération impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusyAction(name);
    setAccountError(null);
    setAccountMessage(null);
    try {
      await action();
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : "Opération impossible.");
    } finally {
      setBusyAction(null);
    }
  };

  if (!account.hydrated) {
    return (
      <section className={styles.loading}>
        <RefreshCw size={22} className="is-spinning" />
        <div><strong>Préparation du compte</strong><span>Lecture des données de cet appareil…</span></div>
      </section>
    );
  }

  if (!account.user) {
    return (
      <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>ANATOLE v0.9.3</span>
            <h1>Retrouve ton espace sur tous tes appareils</h1>
            <p>Watchlist, Portefeuille, Alertes, préférences et profil Anatole Conseil restent utilisables sans compte. La connexion ajoute uniquement la synchronisation.</p>
          </div>
          <div className={styles.heroIcon}><Cloud size={42} /></div>
        </header>

        <section className={styles.authGrid}>
          <form className={styles.authCard} onSubmit={submit}>
            <div className={styles.modeSwitch}>
              <button type="button" className={mode === "login" ? styles.active : ""} onClick={() => setMode("login")}>Connexion</button>
              <button type="button" className={mode === "register" ? styles.active : ""} onClick={() => setMode("register")}>Créer un compte</button>
            </div>

            <div className={styles.formHeading}>
              <UserRound size={22} />
              <div>
                <h2>{mode === "login" ? "Ouvrir mon espace" : "Créer mon espace Anatole"}</h2>
                <p>{mode === "login" ? "Tes données locales seront fusionnées avec le compte." : "Les données présentes sur cet appareil seront importées automatiquement."}</p>
              </div>
            </div>

            {mode === "register" ? (
              <label>
                <span>Prénom ou nom affiché</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="Facultatif" />
              </label>
            ) : null}
            <label>
              <span>Courriel</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="toi@exemple.com" />
            </label>
            <label>
              <span>Mot de passe</span>
              <input type="password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="10 caractères, une lettre et un chiffre" />
            </label>

            {formError || account.error ? <div className={styles.error}>{formError ?? account.error}</div> : null}
            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              {submitting ? <RefreshCw size={18} className="is-spinning" /> : <LockKeyhole size={18} />}
              {mode === "login" ? "Me connecter" : "Créer et synchroniser"}
            </button>
          </form>

          <aside className={styles.explainer}>
            <article><Laptop size={22} /><div><strong>Continue sans compte</strong><p>Anatole conserve toujours le mode local. Aucun écran n’est bloqué.</p></div></article>
            <article><Smartphone size={22} /><div><strong>Passe d’un appareil à l’autre</strong><p>Les modifications sont fusionnées puis synchronisées automatiquement.</p></div></article>
            <article><ShieldCheck size={22} /><div><strong>Aucun identifiant bancaire</strong><p>Le compte ne demande ni numéro de compte, ni accès bancaire, ni pièce d’identité.</p></div></article>
            <article><Database size={22} /><div><strong>Données synchronisées</strong><p>Watchlist, positions de suivi, alertes, préférences, univers et profil de planification.</p></div></article>
          </aside>
        </section>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>MON ESPACE ANATOLE · v0.9.3</span>
          <h1>{account.user.display_name ? `Bonjour ${account.user.display_name}` : "Compte synchronisé"}</h1>
          <p>{account.user.email}</p>
        </div>
        <div className={`${styles.syncOrb} ${
          account.syncState === "synced"
            ? styles.synced
            : account.syncState === "offline"
              ? styles.offline
              : account.syncState === "error"
                ? styles.errorState
                : ""
        }`}>
          {account.syncState === "offline" || account.syncState === "error" ? <CloudOff size={38} /> : <Cloud size={38} />}
        </div>
      </header>

      <section className={styles.statusGrid}>
        <article><span>État</span><strong>{account.syncState === "synced" ? "À jour" : account.syncState === "offline" ? "Hors ligne" : account.syncState === "error" ? "À vérifier" : "Synchronisation"}</strong><small>{account.syncState === "offline" ? "Les changements seront envoyés au retour du réseau." : "Synchronisation automatique activée."}</small></article>
        <article><span>Dernière synchronisation</span><strong>{dateLabel(account.lastSyncedAt)}</strong><small>Révision {account.workspaceRevision}</small></article>
        <article><span>Contrôle</span><strong>Utilisateur</strong><small>Profil, mot de passe, export et suppression disponibles.</small></article>
      </section>

      <nav className={styles.accountTools} aria-label="Gestion du compte">
        <a href="#profil-compte">
          <UserCog size={20} />
          <span><strong>Modifier mon nom</strong><small>Profil du compte</small></span>
        </a>
        <a href="#mot-de-passe">
          <KeyRound size={20} />
          <span><strong>Changer le mot de passe</strong><small>Sécuriser l’accès</small></span>
        </a>
        <a href="#donnees-compte">
          <Download size={20} />
          <span><strong>Exporter mes données</strong><small>Télécharger une copie</small></span>
        </a>
        <a href="#supprimer-compte" className={styles.dangerTool}>
          <Trash2 size={20} />
          <span><strong>Supprimer le compte</strong><small>Action définitive</small></span>
        </a>
      </nav>

      <section className={styles.controlGrid}>
        <form
          id="profil-compte"
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            void runAction("profile", async () => {
              await updateAccountProfile(profileName.trim() || null);
              await account.refreshAccount();
              setAccountMessage("Nom affiché mis à jour.");
            });
          }}
        >
          <div className={styles.cardHeading}><UserCog size={22} /><div><h2>Profil</h2><p>Le courriel reste l’identifiant de connexion.</p></div></div>
          <label><span>Nom affiché</span><input value={profileName} maxLength={60} onChange={(event) => setProfileName(event.target.value)} placeholder="Nom affiché" /></label>
          <button type="submit" disabled={busyAction === "profile"}><Save size={17} /> Enregistrer</button>
        </form>

        <form
          id="mot-de-passe"
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            if (newPassword !== confirmPassword) {
              setAccountError("Les deux nouveaux mots de passe ne correspondent pas.");
              return;
            }
            void runAction("password", async () => {
              await changeAccountPassword({
                current_password: currentPassword,
                new_password: newPassword,
              });
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setAccountMessage("Mot de passe changé. Les autres sessions ont été fermées.");
            });
          }}
        >
          <div className={styles.cardHeading}><KeyRound size={22} /><div><h2>Mot de passe</h2><p>Le changement ferme les autres appareils connectés.</p></div></div>
          <label><span>Mot de passe actuel</span><input type="password" required minLength={10} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label><span>Nouveau mot de passe</span><input type="password" required minLength={10} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label><span>Confirmer</span><input type="password" required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <button type="submit" disabled={busyAction === "password"}><LockKeyhole size={17} /> Changer le mot de passe</button>
        </form>
      </section>

      <section id="donnees-compte" className={styles.securityCard}>
        <div><ShieldCheck size={23} /><div><h2>Sessions et données</h2><p>Exporte une copie de tes données ou ferme les sessions ouvertes sur les autres appareils.</p></div></div>
        <div className={styles.securityActions}>
          <button
            type="button"
            disabled={busyAction === "export"}
            onClick={() => void runAction("export", async () => {
              const exported = await exportAccountData();
              downloadJson(`anatole-export-${new Date().toISOString().slice(0, 10)}.json`, exported);
              setAccountMessage("Export téléchargé sur cet appareil.");
            })}
          ><Download size={17} /> Exporter mes données</button>
          <button type="button" onClick={() => void account.signOut()}><LogOut size={17} /> Se déconnecter ici</button>
          <button type="button" onClick={() => void account.signOutEverywhere()}><LockKeyhole size={17} /> Fermer toutes les sessions</button>
        </div>
      </section>

      <section className={styles.dataCard}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>CONTENU SYNCHRONISÉ</span><h2>Ton espace actuel</h2></div>
          <button type="button" onClick={() => void account.syncNow()} disabled={account.syncState === "syncing"}>
            <RefreshCw size={17} className={account.syncState === "syncing" ? "is-spinning" : ""} /> Synchroniser maintenant
          </button>
        </div>
        <div className={styles.countGrid}>
          <article><strong>{counts?.watchlist ?? 0}</strong><span>Titres suivis</span></article>
          <article><strong>{counts?.portfolio ?? 0}</strong><span>Positions</span></article>
          <article><strong>{counts?.alerts ?? 0}</strong><span>Alertes</span></article>
          <article><strong>{counts?.comparator ?? 0}</strong><span>Titres comparés</span></article>
        </div>
        <div className={styles.confirmation}><CheckCircle2 size={18} /><span>Les modifications locales sont envoyées automatiquement environ cinq secondes après un changement.</span></div>
        {account.error ? <div className={styles.error}>{account.error}</div> : null}
      </section>

      <section id="supprimer-compte" className={styles.dangerZone}>
        <div className={styles.cardHeading}><Trash2 size={23} /><div><h2>Supprimer le compte</h2><p>Cette action efface le compte et l’espace synchronisé. Les données locales de cet appareil restent dans le navigateur.</p></div></div>
        <div className={styles.deleteGrid}>
          <label><span>Mot de passe</span><input type="password" minLength={10} value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" /></label>
          <label><span>Écris SUPPRIMER</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value.toUpperCase())} placeholder="SUPPRIMER" /></label>
          <button
            type="button"
            className={styles.deleteButton}
            disabled={deleteConfirmation !== "SUPPRIMER" || deletePassword.length < 10 || busyAction === "delete"}
            onClick={() => void runAction("delete", async () => {
              await account.deleteMyAccount(deletePassword);
            })}
          ><Trash2 size={17} /> Supprimer définitivement</button>
        </div>
      </section>

      {accountMessage ? <div className={styles.successMessage}>{accountMessage}</div> : null}
      {accountError ? <div className={styles.error}>{accountError}</div> : null}
    </div>
  );
}
