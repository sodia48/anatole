import { resilientFetch } from "./resilient-fetch";

export type NotificationFrequency = "off" | "daily" | "weekdays" | "weekly";

export type NotificationPreferences = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  digest_frequency: NotificationFrequency;
  digest_time: string;
  timezone: string;
  weekly_day: number;
  include_watchlist: boolean;
  include_portfolio: boolean;
  include_alerts: boolean;
  include_calendar: boolean;
  updated_at: string | null;
};

export type NotificationPreferencesEnvelope = {
  preferences: NotificationPreferences;
  account_email: string;
  email_delivery_available: boolean;
};

export type NotificationItem = {
  id: string;
  kind: "alert" | "watchlist" | "calendar" | "digest" | "system";
  title: string;
  message: string;
  severity: "info" | "attention" | "important";
  symbol: string | null;
  route: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationFeed = {
  items: NotificationItem[];
  unread_count: number;
  generated_at: string;
};

export type NotificationDigest = {
  subject: string;
  greeting: string;
  summary: string;
  sections: Array<{ key: string; title: string; items: string[] }>;
  generated_at: string;
  disclaimer: string;
};

async function notificationError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { detail?: string };
    if (body.detail) return new Error(body.detail);
  } catch {
    // Le statut HTTP reste visible si la réponse n'est pas JSON.
  }
  return new Error(`Erreur de notifications ${response.status}`);
}

async function notificationRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await resilientFetch(`/api/notifications${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    retries: options.method && options.method !== "GET" ? 0 : 1,
    timeoutMs: 30_000,
    allowStale: false,
  });
  if (!response.ok) throw await notificationError(response);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function getNotificationFeed(): Promise<NotificationFeed> {
  return notificationRequest<NotificationFeed>("/feed?limit=80");
}

export function refreshNotifications(): Promise<NotificationFeed> {
  return notificationRequest<NotificationFeed>("/refresh", { method: "POST" });
}

export function markNotificationRead(id: string): Promise<void> {
  return notificationRequest<void>(`/feed/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(): Promise<void> {
  return notificationRequest<void>("/read-all", { method: "POST" });
}

export function getNotificationPreferences(): Promise<NotificationPreferencesEnvelope> {
  return notificationRequest<NotificationPreferencesEnvelope>("/preferences");
}

export function saveNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferencesEnvelope> {
  return notificationRequest<NotificationPreferencesEnvelope>("/preferences", {
    method: "PUT",
    body: JSON.stringify(preferences),
  });
}

export function previewNotificationDigest(): Promise<NotificationDigest> {
  return notificationRequest<NotificationDigest>("/preview");
}

export function sendTestNotificationDigest(): Promise<NotificationDigest> {
  return notificationRequest<NotificationDigest>("/send-test", { method: "POST" });
}
