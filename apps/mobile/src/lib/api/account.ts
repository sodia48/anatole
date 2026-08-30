import { apiRequest } from "./base";
import type { AccountSession, AccountStatus, WorkspaceSnapshot } from "./types";

export const accountApi = {
  registration: () => apiRequest<{ enabled: boolean; invite_required: boolean; terms_version: string; privacy_version: string }>("/api/v1/account/registration"),
  login: (email: string, password: string) => apiRequest<AccountSession>("/api/v1/account/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }),
  register: (input: { email: string; password: string; displayName?: string; inviteCode?: string }) => apiRequest<AccountSession>("/api/v1/account/register", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      display_name: input.displayName,
      invite_code: input.inviteCode,
      accepted_terms: true,
      accepted_privacy: true,
    }),
  }),
  me: () => apiRequest<AccountStatus>("/api/v1/account/me", { auth: true }),
  workspace: () => apiRequest<WorkspaceSnapshot>("/api/v1/account/workspace", { auth: true }),
  updateWorkspace: (workspace: WorkspaceSnapshot) => apiRequest<WorkspaceSnapshot>("/api/v1/account/workspace", {
    method: "PUT",
    auth: true,
    body: JSON.stringify({ expected_revision: workspace.revision, data: workspace.data, client_updated_at: new Date().toISOString() }),
  }),
  logout: () => apiRequest<void>("/api/v1/account/logout", { method: "POST", auth: true }),
};
