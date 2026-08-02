import { resilientFetch } from "./resilient-fetch";
import type { SyncedWorkspaceData } from "./workspace-sync";

export type AccountUser = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type WorkspaceSnapshot = {
  revision: number;
  data: SyncedWorkspaceData;
  updated_at: string | null;
};

export type AccountSession = {
  expires_at: string;
  user: AccountUser;
  workspace: WorkspaceSnapshot;
};

export type AccountStatus = {
  user: AccountUser;
  workspace_revision: number;
  workspace_updated_at: string | null;
};

export class WorkspaceConflict extends Error {
  currentRevision: number;

  constructor(currentRevision: number) {
    super("Une version plus récente existe sur un autre appareil.");
    this.currentRevision = currentRevision;
  }
}

async function accountError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as {
      detail?: string | { message?: string; current_revision?: number };
    };
    if (response.status === 409 && typeof body.detail === "object") {
      return new WorkspaceConflict(Number(body.detail.current_revision ?? 0));
    }
    if (typeof body.detail === "string") return new Error(body.detail);
    if (typeof body.detail?.message === "string") return new Error(body.detail.message);
  } catch {
    // Réponse non JSON.
  }
  return new Error(`Erreur de compte ${response.status}`);
}

async function accountRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await resilientFetch(`/api/account${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    retries: 1,
    timeoutMs: 25_000,
    allowStale: false,
  });
  if (!response.ok) throw await accountError(response);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function registerAccount(input: {
  email: string;
  password: string;
  display_name?: string;
}): Promise<AccountSession> {
  return accountRequest<AccountSession>("/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginAccount(input: {
  email: string;
  password: string;
}): Promise<AccountSession> {
  return accountRequest<AccountSession>("/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAccountStatus(): Promise<AccountStatus> {
  return accountRequest<AccountStatus>("/me");
}

export function logoutAccount(): Promise<void> {
  return accountRequest<void>("/logout", { method: "POST" });
}

export function logoutAllAccounts(): Promise<void> {
  return accountRequest<void>("/logout-all", { method: "POST" });
}

export function getRemoteWorkspace(): Promise<WorkspaceSnapshot> {
  return accountRequest<WorkspaceSnapshot>("/workspace");
}

export function putRemoteWorkspace(
  expectedRevision: number,
  data: SyncedWorkspaceData,
): Promise<WorkspaceSnapshot> {
  return accountRequest<WorkspaceSnapshot>(
    "/workspace",
    {
      method: "PUT",
      body: JSON.stringify({
        expected_revision: expectedRevision,
        data,
        client_updated_at: new Date().toISOString(),
      }),
    },
  );
}

export type AccountExport = {
  exported_at: string;
  user: AccountUser;
  workspace: WorkspaceSnapshot;
};

export function updateAccountProfile(displayName: string | null): Promise<AccountUser> {
  return accountRequest<AccountUser>("/profile", {
    method: "PUT",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export function changeAccountPassword(input: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  return accountRequest<void>("/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function exportAccountData(): Promise<AccountExport> {
  return accountRequest<AccountExport>("/export");
}

export function deleteAccount(input: {
  password: string;
  confirmation: "SUPPRIMER";
}): Promise<void> {
  return accountRequest<void>("/delete", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

