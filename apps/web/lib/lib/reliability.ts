export type ApiTrace = {
  requestId: string;
  url: string;
  status: number | null;
  durationMs: number;
  attempts: number;
  stale: boolean;
  recordedAt: string;
};

export type FeedbackCategory =
  | "bug"
  | "data"
  | "performance"
  | "interface"
  | "other";

export type FeedbackPayload = {
  category: FeedbackCategory;
  message: string;
  route: string;
  section?: string | null;
  universe?: string | null;
  request_id?: string | null;
  user_agent?: string | null;
  viewport_width?: number | null;
  viewport_height?: number | null;
  app_version?: string | null;
  consent_diagnostics: boolean;
};

export type FeedbackResponse = {
  accepted: boolean;
  report_id: string;
  received_at: string;
  detail: string;
};

const LAST_TRACE_KEY = "anatole:last-api-trace";
const CLIENT_EVENT_URL = "/api/anatole/api/v1/reliability/client-event";
const FEEDBACK_URL = "/api/anatole/api/v1/reliability/feedback";
const recentClientEvents = new Map<string, number>();

export function rememberApiTrace(trace: ApiTrace): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LAST_TRACE_KEY, JSON.stringify(trace));
    window.dispatchEvent(new CustomEvent("anatole:api-trace", { detail: trace }));
  } catch {
    // Le stockage privé ou saturé ne doit jamais casser une requête.
  }
}

export function getLastApiTrace(): ApiTrace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_TRACE_KEY);
    return raw ? (JSON.parse(raw) as ApiTrace) : null;
  } catch {
    return null;
  }
}

export function openFeedbackDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("anatole:open-feedback"));
}

export function reportClientEvent(payload: {
  kind: "javascript_error" | "unhandled_rejection" | "api_failure" | "performance";
  message: string;
  stack?: string | null;
  requestId?: string | null;
}): void {
  if (typeof window === "undefined") return;

  const eventKey = `${payload.kind}:${payload.message.slice(0, 220)}`;
  const now = Date.now();
  const previous = recentClientEvents.get(eventKey) ?? 0;
  if (now - previous < 30_000) return;
  recentClientEvents.set(eventKey, now);
  if (recentClientEvents.size > 40) {
    const oldest = [...recentClientEvents.entries()]
      .sort((left, right) => left[1] - right[1])
      .slice(0, 10);
    oldest.forEach(([key]) => recentClientEvents.delete(key));
  }

  const body = JSON.stringify({
    kind: payload.kind,
    message: payload.message.slice(0, 1000),
    stack: payload.stack?.slice(0, 4000) ?? null,
    route: window.location.pathname,
    request_id: payload.requestId ?? getLastApiTrace()?.requestId ?? null,
    user_agent: window.navigator.userAgent,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    occurred_at: new Date().toISOString(),
  });

  try {
    if (window.navigator.sendBeacon) {
      const sent = window.navigator.sendBeacon(
        CLIENT_EVENT_URL,
        new Blob([body], { type: "application/json" }),
      );
      if (sent) return;
    }
  } catch {
    // Repli fetch ci-dessous.
  }

  void fetch(CLIENT_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}

export async function submitFeedback(
  payload: FeedbackPayload,
  signal?: AbortSignal,
): Promise<FeedbackResponse> {
  const response = await fetch(FEEDBACK_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Signalement indisponible (HTTP ${response.status}).`);
  }

  return (await response.json()) as FeedbackResponse;
}
