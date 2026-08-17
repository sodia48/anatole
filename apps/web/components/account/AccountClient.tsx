"use client";

import { useEffect, useState } from "react";
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
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import {
  changeAccountPassword,
  exportAccountData,
  getRegistrationPolicy,
  type AccountRegistrationPolicy,
  updateAccountProfile,
} from "@/lib/account";
import { readLocalWorkspace } from "@/lib/workspace-sync";
import { ANATOLE_VERSION_LABEL } from "@/lib/version";

import styles from "./Account.module.css";

type Mode = "login" | "register";

function dateLabel(value: string | null, language: AnatoleLanguage): string {
  if (!value) return pick(language, "Jamais", "Never");
  return new Intl.DateTimeFormat(localeFor(language), {
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
  const { preferences } = usePreferences();
  const language = preferences.language;
  const deleteKeyword = pick(language, "SUPPRIMER", "DELETE");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [registrationPolicy, setRegistrationPolicy] =
    useState<AccountRegistrationPolicy | null>(null);
  const [registrationPolicyError, setRegistrationPolicyError] =
    useState<string | null>(null);
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
    const timer = window.setTimeout(
      () => setProfileName(account.user?.display_name ?? ""),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [account.user?.display_name]);

  useEffect(() => {
    let cancelled = false;

    void getRegistrationPolicy()
      .then((policy) => {
        if (!cancelled) {
          setRegistrationPolicy(policy);
          setRegistrationPolicyError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRegistrationPolicy(null);
          setRegistrationPolicyError(
            pick(language, "La politique d’inscription est indisponible. La connexion reste accessible, mais aucune inscription ne peut être acceptée pour le moment.", "The registration policy is unavailable. Sign-in remains available, but registration cannot be accepted right now."),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  const localData = account.hydrated ? readLocalWorkspace().data : null;
  const counts = localData ? {
    watchlist: localData.watchlist.length,
    portfolio: localData.portfolio.length,
    alerts: localData.alerts.length,
    comparator: localData.comparator_symbols.length,
  } : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (mode === "register") {
        if (!registrationPolicy?.enabled) {
          throw new Error(
            registrationPolicyError ?? pick(language, "Les nouvelles inscriptions sont temporairement fermées.", "New registrations are temporarily closed."),
          );
        }
        await account.register(
          email,
          password,
          displayName || undefined,
          {
            inviteCode: inviteCode || undefined,
            acceptedTerms,
            acceptedPrivacy,
          },
        );
      } else {
        await account.signIn(email, password);
      }
      setPassword("");
    } catch (reason) {
      setFormError(language === "fr" && reason instanceof Error ? reason.message : pick(language, "Opération impossible.", "Unable to complete the operation."));
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
      setAccountError(language === "fr" && reason instanceof Error ? reason.message : pick(language, "Opération impossible.", "Unable to complete the operation."));
    } finally {
      setBusyAction(null);
    }
  };

  if (!account.hydrated) {
    return (
      <section className={styles.loading}>
        <RefreshCw size={22} className="is-spinning" />
        <div><strong>{pick(language, "Préparation du compte", "Preparing account")}</strong><span>{pick(language, "Lecture des données de cet appareil…", "Reading data from this device…")}</span></div>
      </section>
    );
  }

  if (!account.user) {
    return (
      <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>ANATOLE {ANATOLE_VERSION_LABEL}</span>
            <h1>{pick(language, "Retrouve ton espace sur tous tes appareils", "Access your workspace on every device")}</h1>
            <p>{pick(language, "Watchlist, Portefeuille, Alertes, préférences et profil Anatole Conseil restent utilisables sans compte. La connexion ajoute uniquement la synchronisation.", "Watchlist, Portfolio, Alerts, preferences, and your Anatole Advice profile remain available without an account. Signing in only adds synchronization.")}</p>
          </div>
          <div className={styles.heroIcon}><Cloud size={42} /></div>
        </header>

        <section className={styles.authGrid}>
          <form className={styles.authCard} onSubmit={submit}>
            <div className={styles.modeSwitch}>
              <button type="button" className={mode === "login" ? styles.active : ""} onClick={() => setMode("login")}>{pick(language, "Connexion", "Sign in")}</button>
              <button type="button" className={mode === "register" ? styles.active : ""} onClick={() => setMode("register")}>{pick(language, "Créer un compte", "Create account")}</button>
            </div>

            <div className={styles.formHeading}>
              <UserRound size={22} />
              <div>
                <h2>{mode === "login" ? pick(language, "Ouvrir mon espace", "Open my workspace") : pick(language, "Créer mon espace Anatole", "Create my Anatole workspace")}</h2>
                <p>{mode === "login" ? pick(language, "Tes données locales seront fusionnées avec le compte.", "Your local data will be merged with the account.") : pick(language, "Les données présentes sur cet appareil seront importées automatiquement.", "Data on this device will be imported automatically.")}</p>
              </div>
            </div>

            {mode === "register" ? (
              <label>
                <span>{pick(language, "Prénom ou nom affiché", "First name or display name")}</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder={pick(language, "Facultatif", "Optional")} />
              </label>
            ) : null}
            <label>
              <span>{pick(language, "Courriel", "Email")}</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="toi@exemple.com" />
            </label>
            <label>
              <span>{pick(language, "Mot de passe", "Password")}</span>
              <input type="password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={pick(language, "10 caractères, une lettre et un chiffre", "10 characters, one letter, and one number")} />
            </label>

            {mode === "register" && registrationPolicy?.invite_required ? (
              <label>
                <span>{pick(language, "Code d’invitation", "Invitation code")}</span>
                <input
                  required
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  autoComplete="off"
                  placeholder="ANATOLE-BETA-…"
                />
              </label>
            ) : null}

            {mode === "register" ? (
              <div className={styles.legalChecks}>
                <label className={styles.legalCheck}>
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    required
                  />
                  <span>
                    {pick(language, "J’accepte les", "I accept the")} <a href="/conditions" target="_blank" rel="noreferrer">{pick(language, "Conditions d’utilisation", "Terms of Use")}</a>.
                  </span>
                </label>
                <label className={styles.legalCheck}>
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(event) => setAcceptedPrivacy(event.target.checked)}
                    required
                  />
                  <span>
                    {pick(language, "J’ai lu la", "I have read the")} <a href="/confidentialite" target="_blank" rel="noreferrer">{pick(language, "Politique de confidentialité", "Privacy Policy")}</a> {pick(language, "et l’", "and the")}<a href="/avis-financier" target="_blank" rel="noreferrer">{pick(language, "Avis financier", "Financial Notice")}</a>.
                  </span>
                </label>
              </div>
            ) : null}

            {mode === "register" && registrationPolicy && !registrationPolicy.enabled ? (
              <div className={styles.policyNotice}>
                {pick(language, "Les nouvelles inscriptions sont temporairement fermées.", "New registrations are temporarily closed.")}
              </div>
            ) : null}

            {mode === "register" && registrationPolicyError ? (
              <div className={styles.policyNotice} role="alert">
                {registrationPolicyError}
              </div>
            ) : null}

            {formError || account.error ? <div className={styles.error}>{formError ?? (language === "fr" ? account.error : "The account service is temporarily unavailable.")}</div> : null}
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={
                submitting ||
                (mode === "register" &&
                  (!registrationPolicy ||
                    registrationPolicy.enabled === false))
              }
            >
              {submitting ? <RefreshCw size={18} className="is-spinning" /> : <LockKeyhole size={18} />}
              {mode === "login" ? pick(language, "Me connecter", "Sign in") : pick(language, "Créer et synchroniser", "Create and sync")}
            </button>
          </form>

          <aside className={styles.explainer}>
            <article><Laptop size={22} /><div><strong>{pick(language, "Continue sans compte", "Continue without an account")}</strong><p>{pick(language, "Anatole conserve toujours le mode local. Aucun écran n’est bloqué.", "Anatole always keeps local mode available. No screen is blocked.")}</p></div></article>
            <article><Smartphone size={22} /><div><strong>{pick(language, "Passe d’un appareil à l’autre", "Move between devices")}</strong><p>{pick(language, "Les modifications sont fusionnées puis synchronisées automatiquement.", "Changes are merged and then synchronized automatically.")}</p></div></article>
            <article><ShieldCheck size={22} /><div><strong>{pick(language, "Aucun identifiant bancaire", "No banking credentials")}</strong><p>{pick(language, "Le compte ne demande ni numéro de compte, ni accès bancaire, ni pièce d’identité.", "The account requests no account number, banking access, or identity document.")}</p></div></article>
            <article><Database size={22} /><div><strong>{pick(language, "Données synchronisées", "Synchronized data")}</strong><p>{pick(language, "Watchlist, positions de suivi, alertes, préférences, univers et profil de planification.", "Watchlist, tracking positions, alerts, preferences, universe, and planning profile.")}</p></div></article>
          </aside>
        </section>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{pick(language, "MON ESPACE ANATOLE", "MY ANATOLE WORKSPACE")} · {ANATOLE_VERSION_LABEL}</span>
          <h1>{account.user.display_name ? pick(language, `Bonjour ${account.user.display_name}`, `Hello ${account.user.display_name}`) : pick(language, "Compte synchronisé", "Account synchronized")}</h1>
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
        <article><span>{pick(language, "État", "Status")}</span><strong>{account.syncState === "synced" ? pick(language, "À jour", "Up to date") : account.syncState === "offline" ? pick(language, "Hors ligne", "Offline") : account.syncState === "error" ? pick(language, "À vérifier", "Needs attention") : pick(language, "Synchronisation", "Synchronizing")}</strong><small>{account.syncState === "offline" ? pick(language, "Les changements seront envoyés au retour du réseau.", "Changes will be sent when the network returns.") : pick(language, "Synchronisation automatique activée.", "Automatic synchronization enabled.")}</small></article>
        <article><span>{pick(language, "Dernière synchronisation", "Last synchronization")}</span><strong>{dateLabel(account.lastSyncedAt, language)}</strong><small>{pick(language, "Révision", "Revision")} {account.workspaceRevision}</small></article>
        <article><span>{pick(language, "Contrôle", "Control")}</span><strong>{pick(language, "Utilisateur", "User")}</strong><small>{pick(language, "Profil, mot de passe, export et suppression disponibles.", "Profile, password, export, and deletion are available.")}</small></article>
      </section>

      <nav className={styles.accountTools} aria-label={pick(language, "Gestion du compte", "Account management")}>
        <a href="#profil-compte">
          <UserCog size={20} />
          <span><strong>{pick(language, "Modifier mon nom", "Edit my name")}</strong><small>{pick(language, "Profil du compte", "Account profile")}</small></span>
        </a>
        <a href="#mot-de-passe">
          <KeyRound size={20} />
          <span><strong>{pick(language, "Changer le mot de passe", "Change password")}</strong><small>{pick(language, "Sécuriser l’accès", "Secure access")}</small></span>
        </a>
        <a href="#donnees-compte">
          <Download size={20} />
          <span><strong>{pick(language, "Exporter mes données", "Export my data")}</strong><small>{pick(language, "Télécharger une copie", "Download a copy")}</small></span>
        </a>
        <a href="#supprimer-compte" className={styles.dangerTool}>
          <Trash2 size={20} />
          <span><strong>{pick(language, "Supprimer le compte", "Delete account")}</strong><small>{pick(language, "Action définitive", "Permanent action")}</small></span>
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
              setAccountMessage(pick(language, "Nom affiché mis à jour.", "Display name updated."));
            });
          }}
        >
          <div className={styles.cardHeading}><UserCog size={22} /><div><h2>{pick(language, "Profil", "Profile")}</h2><p>{pick(language, "Le courriel reste l’identifiant de connexion.", "Email remains the sign-in identifier.")}</p></div></div>
          <label><span>{pick(language, "Nom affiché", "Display name")}</span><input value={profileName} maxLength={60} onChange={(event) => setProfileName(event.target.value)} placeholder={pick(language, "Nom affiché", "Display name")} /></label>
          <button type="submit" disabled={busyAction === "profile"}><Save size={17} /> {pick(language, "Enregistrer", "Save")}</button>
        </form>

        <form
          id="mot-de-passe"
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            if (newPassword !== confirmPassword) {
              setAccountError(pick(language, "Les deux nouveaux mots de passe ne correspondent pas.", "The two new passwords do not match."));
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
              setAccountMessage(pick(language, "Mot de passe changé. Les autres sessions ont été fermées.", "Password changed. Other sessions have been closed."));
            });
          }}
        >
          <div className={styles.cardHeading}><KeyRound size={22} /><div><h2>{pick(language, "Mot de passe", "Password")}</h2><p>{pick(language, "Le changement ferme les autres appareils connectés.", "Changing it signs out other connected devices.")}</p></div></div>
          <label><span>{pick(language, "Mot de passe actuel", "Current password")}</span><input type="password" required minLength={10} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label><span>{pick(language, "Nouveau mot de passe", "New password")}</span><input type="password" required minLength={10} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label><span>{pick(language, "Confirmer", "Confirm")}</span><input type="password" required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <button type="submit" disabled={busyAction === "password"}><LockKeyhole size={17} /> {pick(language, "Changer le mot de passe", "Change password")}</button>
        </form>
      </section>

      <section id="donnees-compte" className={styles.securityCard}>
        <div><ShieldCheck size={23} /><div><h2>{pick(language, "Sessions et données", "Sessions and data")}</h2><p>{pick(language, "Exporte une copie de tes données ou ferme les sessions ouvertes sur les autres appareils.", "Export a copy of your data or close sessions open on other devices.")}</p></div></div>
        <div className={styles.securityActions}>
          <button
            type="button"
            disabled={busyAction === "export"}
            onClick={() => void runAction("export", async () => {
              const exported = await exportAccountData();
              downloadJson(`anatole-export-${new Date().toISOString().slice(0, 10)}.json`, exported);
              setAccountMessage(pick(language, "Export téléchargé sur cet appareil.", "Export downloaded to this device."));
            })}
          ><Download size={17} /> {pick(language, "Exporter mes données", "Export my data")}</button>
          <button type="button" onClick={() => void account.signOut()}><LogOut size={17} /> {pick(language, "Se déconnecter ici", "Sign out here")}</button>
          <button type="button" onClick={() => void account.signOutEverywhere()}><LockKeyhole size={17} /> {pick(language, "Fermer toutes les sessions", "Close all sessions")}</button>
        </div>
      </section>

      <section className={styles.dataCard}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>{pick(language, "CONTENU SYNCHRONISÉ", "SYNCHRONIZED CONTENT")}</span><h2>{pick(language, "Ton espace actuel", "Your current workspace")}</h2></div>
          <button type="button" onClick={() => void account.syncNow()} disabled={account.syncState === "syncing"}>
            <RefreshCw size={17} className={account.syncState === "syncing" ? "is-spinning" : ""} /> {pick(language, "Synchroniser maintenant", "Synchronize now")}
          </button>
        </div>
        <div className={styles.countGrid}>
          <article><strong>{counts?.watchlist ?? 0}</strong><span>{pick(language, "Titres suivis", "Tracked securities")}</span></article>
          <article><strong>{counts?.portfolio ?? 0}</strong><span>Positions</span></article>
          <article><strong>{counts?.alerts ?? 0}</strong><span>{pick(language, "Alertes", "Alerts")}</span></article>
          <article><strong>{counts?.comparator ?? 0}</strong><span>{pick(language, "Titres comparés", "Compared securities")}</span></article>
        </div>
        <div className={styles.confirmation}><CheckCircle2 size={18} /><span>{pick(language, "Les modifications locales sont envoyées automatiquement environ cinq secondes après un changement.", "Local changes are sent automatically about five seconds after an update.")}</span></div>
        {account.error ? <div className={styles.error}>{language === "fr" ? account.error : "Account synchronization is temporarily unavailable."}</div> : null}
      </section>

      <section id="supprimer-compte" className={styles.dangerZone}>
        <div className={styles.cardHeading}><Trash2 size={23} /><div><h2>{pick(language, "Supprimer le compte", "Delete account")}</h2><p>{pick(language, "Cette action efface le compte et l’espace synchronisé. Les données locales de cet appareil restent dans le navigateur.", "This action deletes the account and synchronized workspace. Local data on this device remains in the browser.")}</p></div></div>
        <div className={styles.deleteGrid}>
          <label><span>{pick(language, "Mot de passe", "Password")}</span><input type="password" minLength={10} value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" /></label>
          <label><span>{pick(language, "Écris SUPPRIMER", "Type DELETE")}</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value.toUpperCase())} placeholder={deleteKeyword} /></label>
          <button
            type="button"
            className={styles.deleteButton}
            disabled={deleteConfirmation !== deleteKeyword || deletePassword.length < 10 || busyAction === "delete"}
            onClick={() => void runAction("delete", async () => {
              await account.deleteMyAccount(deletePassword);
            })}
          ><Trash2 size={17} /> {pick(language, "Supprimer définitivement", "Delete permanently")}</button>
        </div>
      </section>

      {accountMessage ? <div className={styles.successMessage}>{accountMessage}</div> : null}
      {accountError ? <div className={styles.error}>{accountError}</div> : null}
    </div>
  );
}
