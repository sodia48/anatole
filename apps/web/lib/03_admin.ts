import { resilientFetch } from "./resilient-fetch";

export type AdminOverview = {
  generated_at: string;
  total_users: number;
  new_users_7d: number;
  active_users_7d: number;
  active_sessions: number;
  synced_accounts: number;
  total_workspace_revisions: number;
  active_invites: number;
  open_reports: number;
  reliability: {
    status: "healthy" | "degraded" | "critical";
    uptime_seconds: number;
    total_requests: number;
    total_4xx: number;
    total_5xx: number;
    total_exceptions: number;
    error_rate_5xx: number;
    average_duration_ms: number;
    p95_duration_ms: number;
    max_duration_ms: number;
    slow_requests: number;
    reports_received: number;
    last_report_at: string | null;
    recent_errors: Array<{
      path: string;
      method: string;
      status_code: number;
      duration_ms: number;
      request_id: string;
      occurred_at: string;
    }>;
  };
  upstream_metrics: Record<string, number | string | null>;
};

export type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  active_sessions: number;
  workspace_revision: number;
  workspace_updated_at: string | null;
  watchlist_count: number;
  portfolio_count: number;
  alert_count: number;
  comparator_count: number;
};

export type AdminInvite = {
  id: string;
  label: string;
  code_hint: string;
  max_uses: number;
  uses: number;
  disabled: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  active: boolean;
};

export type AdminInviteCreated = AdminInvite & { code: string };

export type AdminReportStatus = "new" | "reviewing" | "resolved";

export type AdminReport = {
  report_id: string;
  category: string;
  message: string;
  route: string;
  section: string | null;
  universe: string | null;
  request_id: string | null;
  viewport: string | null;
  app_version: string | null;
  user_agent: string | null;
  diagnostics_included: boolean;
  status: AdminReportStatus;
  created_at: string;
  updated_at: string;
};

async function adminError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (typeof body.detail === "string") return new Error(body.detail);
  } catch {
    // Réponse non JSON.
  }
  return new Error(`Erreur administrateur ${response.status}`);
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await resilientFetch(`/api/admin${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    retries: 1,
    timeoutMs: 25_000,
    allowStale: false,
  });
  if (!response.ok) throw await adminError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getAdminOverview(): Promise<AdminOverview> {
  return adminRequest<AdminOverview>("/overview");
}

export async function getAdminUsers(query = ""): Promise<{ total: number; users: AdminUser[] }> {
  const suffix = query.trim() ? `?query=${encodeURIComponent(query.trim())}` : "";
  return adminRequest<{ total: number; users: AdminUser[] }>(`/users${suffix}`);
}

export async function getAdminInvites(): Promise<AdminInvite[]> {
  const result = await adminRequest<{ invites: AdminInvite[] }>("/invites");
  return result.invites;
}

export function createAdminInvite(input: {
  label: string;
  max_uses: number;
  expires_in_days: number | null;
}): Promise<AdminInviteCreated> {
  return adminRequest<AdminInviteCreated>("/invites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeAdminInvite(inviteId: string): Promise<void> {
  return adminRequest<void>(`/invites/${encodeURIComponent(inviteId)}/revoke`, {
    method: "POST",
  });
}

export async function getAdminReports(): Promise<AdminReport[]> {
  const result = await adminRequest<{ reports: AdminReport[] }>("/reports");
  return result.reports;
}

export function updateAdminReport(
  reportId: string,
  status: AdminReportStatus,
): Promise<void> {
  return adminRequest<void>(`/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
