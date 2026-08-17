"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  Clock3,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";

import styles from "./NotificationsClient.module.css";
import { useAccount } from "@/components/providers/AccountProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";
import {
  type NotificationDigest,
  type NotificationFeed,
  type NotificationItem,
  type NotificationPreferencesEnvelope,
  getNotificationFeed,
  getNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  previewNotificationDigest,
  refreshNotifications,
  saveNotificationPreferences,
  sendTestNotificationDigest,
} from "@/lib/notifications";

function formatDate(value: string, language: "fr" | "en"): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-CA" : "fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function safeRoute(item: NotificationItem): string | null {
  return item.route?.startsWith("/") && !item.route.startsWith("//")
    ? item.route
    : null;
}

function notificationCopy(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;

  const exact: Record<string, string> = {
    "Bonjour,": "Hello,",
    "Événement de marché à venir": "Upcoming market event",
    "Résumé Anatole envoyé": "Anatole digest sent",
    "Aucune alerte déclenchée lors de cette vérification.": "No alert was triggered during this check.",
    "Aucun événement majeur prochainement.": "No major event is coming up.",
    "Information générale seulement. Anatole ne formule aucune recommandation de placement.":
      "General information only. Anatole does not provide investment recommendations.",
    "Voici les principaux éléments observés dans ton espace Anatole. Chaque point est descriptif et peut être approfondi dans l’application.":
      "Here are the main items observed in your Anatole workspace. Each point is descriptive and can be explored further in the app.",
  };
  if (exact[value]) return exact[value];

  return value
    .replace(/^Alerte déclenchée · /, "Alert triggered · ")
    .replace(/^Mouvement inhabituel · /, "Unusual move · ")
    .replace(/^Bonjour\s+/, "Hello ")
    .replace(/^Le résumé «\s*/, "The digest “")
    .replace(/\s*» a été envoyé à /, "” was sent to ")
    .replace(/^Déclenchée\s*:\s*/, "Triggered: ")
    .replace(/^Surveillance active\s*:\s*/, "Monitoring: ")
    .replace(/^(Triggered|Monitoring): Prix à /, "$1: Price at ")
    .replace(/^(Triggered|Monitoring): Variation du jour à /, "$1: Daily change at ")
    .replace(/^(Triggered|Monitoring): Momentum 20 séances à /, "$1: 20-session momentum at ")
    .replace(/^(Triggered|Monitoring): Volume relatif à /, "$1: Relative volume at ")
    .replace(/^(Triggered|Monitoring): Score Anatole à /, "$1: Anatole score at ")
    .replace(/Donnée temporairement indisponible\./g, "Data temporarily unavailable.")
    .replace(/Alerte désactivée\./g, "Alert disabled.")
    .replace(/Variation pondérée\s*:/g, "Weighted change:")
    .replace(/Largeur\s*:/g, "Breadth:")
    .replace(/ hausses?, /g, " advancers, ")
    .replace(/ baisses?/g, " decliners")
    .replace(/Secteurs les plus solides\s*:/g, "Strongest sectors:")
    .replace(/Secteurs sous pression\s*:/g, "Sectors under pressure:")
    .replace(/ varie de /g, " changed by ")
    .replace(/ aujourd’hui\.?/g, " today.")
    .replace(/seuil au-dessus de/g, "threshold above")
    .replace(/seuil sous/g, "threshold below")
    .replace(/Portefeuille de suivi/g, "Tracking portfolio")
    .replace(
      /^(\d+) position\(s\) suivie\(s\)\. Consulte Anatole pour la valorisation actualisée\.$/,
      (_, count: string) => `${count} tracked ${count === "1" ? "position" : "positions"}. Open Anatole for the latest valuation.`,
    );
}

function digestSectionTitle(key: string, title: string, language: "fr" | "en"): string {
  if (language === "fr") return title;
  return ({
    market: "Canadian market",
    watchlist: "Watchlist",
    alerts: "Alerts",
    calendar: "Upcoming events",
    portfolio: "Tracking portfolio",
  } as Record<string, string>)[key] ?? notificationCopy(title, language);
}

export function NotificationsClient() {
  const account = useAccount();
  const { preferences: appPreferences } = usePreferences();
  const language = appPreferences.language;
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [settings, setSettings] = useState<NotificationPreferencesEnvelope | null>(null);
  const [digest, setDigest] = useState<NotificationDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account.user) return;
    setLoading(true);
    setError(null);
    try {
      const [nextFeed, nextSettings] = await Promise.all([
        getNotificationFeed(),
        getNotificationPreferences(),
      ]);
      setFeed(nextFeed);
      setSettings(nextSettings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : pick(language, "Notifications indisponibles.", "Notifications unavailable."));
    } finally {
      setLoading(false);
    }
  }, [account.user, language]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : pick(language, "Opération impossible.", "Operation unavailable."));
    } finally {
      setBusy(null);
    }
  };

  if (!account.hydrated) {
    return (
      <main className={styles.page} aria-busy="true">
        <section className={styles.stateCard}>
          <RefreshCw className={styles.spin} size={24} />
          <h1>{pick(language, "Préparation des notifications", "Preparing notifications")}</h1>
        </section>
      </main>
    );
  }

  if (!account.user) {
    return (
      <main className={styles.page}>
        <section className={styles.stateCard}>
          <ShieldCheck size={34} />
          <span className={styles.eyebrow}>{pick(language, "ESPACE PRIVÉ", "PRIVATE AREA")}</span>
          <h1>{pick(language, "Connecte-toi pour voir tes notifications", "Sign in to view your notifications")}</h1>
          <p>{pick(language, "Le fil et les préférences sont liés à ton compte et ne sont jamais exposés sans session.", "Your feed and preferences are tied to your account and are never exposed without a session.")}</p>
          <Link className={styles.primaryButton} href="/parametres?section=account">
            {pick(language, "Ouvrir mon compte", "Open my account")}
          </Link>
        </section>
      </main>
    );
  }

  const notificationPreferences = settings?.preferences;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{pick(language, "CENTRE DE NOTIFICATIONS", "NOTIFICATION CENTER")}</span>
          <h1>{pick(language, "Tes signaux Anatole", "Your Anatole signals")}</h1>
          <p>{pick(language, "Alertes, calendrier et résumés réunis dans un fil lié à ton compte.", "Alerts, calendar events, and digests in one account-linked feed.")}</p>
        </div>
        <div className={styles.unread} aria-label={pick(language, `${feed?.unread_count ?? 0} non lues`, `${feed?.unread_count ?? 0} unread`)}>
          <Bell size={26} />
          <strong>{feed?.unread_count ?? 0}</strong>
          <span>{pick(language, "non lues", "unread")}</span>
        </div>
      </header>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => void run("refresh", async () => setFeed(await refreshNotifications()))}
          disabled={Boolean(busy)}
        >
          <RefreshCw className={busy === "refresh" ? styles.spin : ""} size={17} />
          {pick(language, "Actualiser les signaux", "Refresh signals")}
        </button>
        <button
          type="button"
          onClick={() => void run("read-all", async () => {
            await markAllNotificationsRead();
            setFeed((current) => current ? {
              ...current,
              unread_count: 0,
              items: current.items.map((item) => ({
                ...item,
                read_at: item.read_at ?? new Date().toISOString(),
              })),
            } : current);
          })}
          disabled={Boolean(busy) || !feed?.unread_count}
        >
          <CheckCheck size={17} />
          {pick(language, "Tout marquer comme lu", "Mark all as read")}
        </button>
      </div>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {message ? <div className={styles.success} role="status">{message}</div> : null}

      <div className={styles.grid}>
        <section className={styles.panel} aria-busy={loading}>
          <div className={styles.panelHeading}>
            <div><span>{pick(language, "FIL", "FEED")}</span><h2>{pick(language, "Activité récente", "Recent activity")}</h2></div>
            {feed?.generated_at ? <small>{formatDate(feed.generated_at, language)}</small> : null}
          </div>
          {loading && !feed ? (
            <div className={styles.empty}><RefreshCw className={styles.spin} size={22} />{pick(language, "Chargement du fil…", "Loading feed…")}</div>
          ) : feed?.items.length ? (
            <ul className={styles.feed}>
              {feed.items.map((item) => {
                const route = safeRoute(item);
                return (
                  <li className={`${styles.item} ${item.read_at ? styles.read : ""}`} key={item.id}>
                    <span className={`${styles.severity} ${styles[item.severity]}`} aria-hidden="true" />
                    <div>
                      <div className={styles.itemTitle}>
                        <strong>{notificationCopy(item.title, language)}</strong>
                        {!item.read_at ? <em>{pick(language, "Nouveau", "New")}</em> : null}
                      </div>
                      <p>{notificationCopy(item.message, language)}</p>
                      <small><Clock3 size={13} /> {formatDate(item.created_at, language)}</small>
                      <div className={styles.itemActions}>
                        {route ? <Link href={route}>{pick(language, "Ouvrir", "Open")}</Link> : null}
                        {!item.read_at ? (
                          <button
                            type="button"
                            onClick={() => void run(`read-${item.id}`, async () => {
                              await markNotificationRead(item.id);
                              setFeed((current) => current ? {
                                ...current,
                                unread_count: Math.max(0, current.unread_count - 1),
                                items: current.items.map((candidate) => candidate.id === item.id
                                  ? { ...candidate, read_at: new Date().toISOString() }
                                  : candidate),
                              } : current);
                            })}
                            disabled={Boolean(busy)}
                          >
                            {pick(language, "Marquer comme lu", "Mark as read")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}><Bell size={24} />{pick(language, "Aucune notification pour le moment.", "No notifications yet.")}</div>
          )}
        </section>

        <aside className={styles.side}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div><span>{pick(language, "PRÉFÉRENCES", "PREFERENCES")}</span><h2>{pick(language, "Résumé et canaux", "Digest and channels")}</h2></div>
              <Mail size={20} />
            </div>
            {notificationPreferences ? (
              <form
                className={styles.preferences}
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("save", async () => {
                    const saved = await saveNotificationPreferences(notificationPreferences);
                    setSettings(saved);
                    setMessage(pick(language, "Préférences enregistrées.", "Preferences saved."));
                  });
                }}
              >
                <label className={styles.check}><input type="checkbox" checked={notificationPreferences.in_app_enabled} onChange={(event) => setSettings((current) => current ? { ...current, preferences: { ...current.preferences, in_app_enabled: event.target.checked } } : current)} /> {pick(language, "Notifications dans Anatole", "In-app notifications")}</label>
                <label className={styles.check}><input type="checkbox" checked={notificationPreferences.email_enabled} disabled={!settings.email_delivery_available} onChange={(event) => setSettings((current) => current ? { ...current, preferences: { ...current.preferences, email_enabled: event.target.checked } } : current)} /> {pick(language, "Résumé par courriel", "Email digest")}</label>
                {!settings.email_delivery_available ? <small>{pick(language, "L’envoi courriel n’est pas configuré sur ce serveur.", "Email delivery is not configured on this server.")}</small> : null}
                <label><span>{pick(language, "Fréquence", "Frequency")}</span><select value={notificationPreferences.digest_frequency} onChange={(event) => setSettings((current) => current ? { ...current, preferences: { ...current.preferences, digest_frequency: event.target.value as typeof notificationPreferences.digest_frequency } } : current)}><option value="off">{pick(language, "Désactivé", "Off")}</option><option value="daily">{pick(language, "Chaque jour", "Daily")}</option><option value="weekdays">{pick(language, "Jours ouvrables", "Weekdays")}</option><option value="weekly">{pick(language, "Chaque semaine", "Weekly")}</option></select></label>
                <label><span>{pick(language, "Heure", "Time")}</span><input type="time" value={notificationPreferences.digest_time} onChange={(event) => setSettings((current) => current ? { ...current, preferences: { ...current.preferences, digest_time: event.target.value } } : current)} /></label>
                <label><span>{pick(language, "Fuseau horaire", "Time zone")}</span><select value={notificationPreferences.timezone} onChange={(event) => setSettings((current) => current ? { ...current, preferences: { ...current.preferences, timezone: event.target.value } } : current)}><option value="America/Toronto">Toronto</option><option value="America/Winnipeg">Winnipeg</option><option value="America/Edmonton">Edmonton</option><option value="America/Vancouver">Vancouver</option><option value="America/Halifax">Halifax</option><option value="America/St_Johns">St. John’s</option></select></label>
                <fieldset><legend>{pick(language, "Inclure dans le résumé", "Include in digest")}</legend>{(["include_watchlist", "include_portfolio", "include_alerts", "include_calendar"] as const).map((key) => <label className={styles.check} key={key}><input type="checkbox" checked={notificationPreferences[key]} onChange={(event) => setSettings((current) => current ? { ...current, preferences: { ...current.preferences, [key]: event.target.checked } } : current)} />{{ include_watchlist: pick(language, "Watchlist", "Watchlist"), include_portfolio: pick(language, "Portefeuille", "Portfolio"), include_alerts: pick(language, "Alertes", "Alerts"), include_calendar: pick(language, "Calendrier", "Calendar") }[key]}</label>)}</fieldset>
                <button className={styles.primaryButton} type="submit" disabled={Boolean(busy)}>{busy === "save" ? <RefreshCw className={styles.spin} size={16} /> : <ShieldCheck size={16} />}{pick(language, "Enregistrer", "Save")}</button>
              </form>
            ) : <div className={styles.empty}>{pick(language, "Préférences indisponibles.", "Preferences unavailable.")}</div>}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><span>{pick(language, "APERÇU", "PREVIEW")}</span><h2>{pick(language, "Prochain résumé", "Next digest")}</h2></div><Send size={20} /></div>
            <div className={styles.digestActions}>
              <button type="button" onClick={() => void run("preview", async () => setDigest(await previewNotificationDigest()))} disabled={Boolean(busy)}>{pick(language, "Prévisualiser", "Preview")}</button>
              {settings?.email_delivery_available ? <button type="button" onClick={() => void run("send", async () => { setDigest(await sendTestNotificationDigest()); setMessage(pick(language, "Résumé de test envoyé.", "Test digest sent.")); })} disabled={Boolean(busy)}>{pick(language, "Envoyer un test", "Send a test")}</button> : null}
            </div>
            {digest ? (
              <article className={styles.digest}>
                <strong>
                  {language === "en"
                    ? `Anatole Today · ${new Intl.DateTimeFormat("en-CA", {
                      dateStyle: "long",
                      timeZone: notificationPreferences?.timezone ?? "America/Toronto",
                    }).format(new Date(digest.generated_at))}`
                    : digest.subject}
                </strong>
                <p>{notificationCopy(digest.greeting, language)}</p>
                <p>{notificationCopy(digest.summary, language)}</p>
                {digest.sections.map((section) => (
                  <section key={section.key}>
                    <h3>{digestSectionTitle(section.key, section.title, language)}</h3>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{notificationCopy(item, language)}</li>
                      ))}
                    </ul>
                  </section>
                ))}
                <small>{notificationCopy(digest.disclaimer, language)}</small>
              </article>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}
