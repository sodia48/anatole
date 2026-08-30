import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";

import { accountApi } from "@/src/lib/api/account";
import { sessionStore } from "@/src/lib/api/session";
import { MobileAccountProvider, useMobileAccount } from "./MobileAccountProvider";

jest.mock("@/src/lib/api/account", () => ({ accountApi: { me: jest.fn(), workspace: jest.fn(), login: jest.fn(), register: jest.fn(), logout: jest.fn(), updateWorkspace: jest.fn() } }));
jest.mock("@/src/lib/api/session", () => ({ sessionStore: { get: jest.fn(), set: jest.fn(), clear: jest.fn() }, onUnauthorized: jest.fn(() => () => undefined) }));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

const user = { id: "u1", email: "mobile@example.com", display_name: "Mobile", created_at: "2026-08-30T00:00:00Z", last_login_at: null, is_admin: false };

function Probe() {
  const account = useMobileAccount();
  return <View><Text>{account.state}|{account.user?.email ?? "none"}|{account.workspaceError ?? "ok"}</Text><Pressable accessibilityLabel="test-login" onPress={() => void account.login("mobile@example.com", "password")}/><Pressable accessibilityLabel="test-logout" onPress={() => void account.logout()}/></View>;
}

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><MobileAccountProvider>{children}</MobileAccountProvider></QueryClientProvider>;
}

describe("MobileAccountProvider", () => {
  beforeEach(() => jest.clearAllMocks());

  it("restores a session and does not log out on workspace failure", async () => {
    jest.mocked(sessionStore.get).mockResolvedValue("token");
    jest.mocked(accountApi.me).mockResolvedValue({ user, workspace_revision: 2, workspace_updated_at: null });
    jest.mocked(accountApi.workspace).mockRejectedValue(new Error("Workspace 503"));
    const view = await render(<TestProvider><Probe /></TestProvider>);
    await waitFor(() => expect(view.getByText("authenticated|mobile@example.com|Workspace 503")).toBeTruthy());
  });

  it("starts anonymous when there is no secure token", async () => {
    jest.mocked(sessionStore.get).mockResolvedValue(null);
    const view = await render(<TestProvider><Probe /></TestProvider>);
    await waitFor(() => expect(view.getByText("anonymous|none|ok")).toBeTruthy());
  });

  it("logs in, stores the session, then logs out and clears private state", async () => {
    const workspace = { revision: 1, updated_at: null, data: { watchlist: [], portfolio: [], alerts: [], preferences: { theme: "dark" as const, density: "comfortable" as const, decimals: 2 as const, default_range: "1y" as const, default_universe: "tsx60" as const, language: "fr" as const }, advisor_profile: null, cockpit_universe: "tsx60" as const, comparator_symbols: [], focus_layouts: [], focus_scripts: [] } };
    jest.mocked(sessionStore.get).mockResolvedValue(null);
    jest.mocked(accountApi.login).mockResolvedValue({ token: "token", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z", user, workspace });
    jest.mocked(accountApi.logout).mockResolvedValue(undefined);
    const view = await render(<TestProvider><Probe /></TestProvider>);
    await waitFor(() => expect(view.getByText("anonymous|none|ok")).toBeTruthy());
    fireEvent.press(view.getByLabelText("test-login"));
    await waitFor(() => expect(view.getByText("authenticated|mobile@example.com|ok")).toBeTruthy());
    expect(sessionStore.set).toHaveBeenCalledWith("token", "2030-01-01T00:00:00Z");
    fireEvent.press(view.getByLabelText("test-logout"));
    await waitFor(() => expect(view.getByText("anonymous|none|ok")).toBeTruthy());
    expect(accountApi.logout).toHaveBeenCalled();
    expect(sessionStore.clear).toHaveBeenCalled();
  }, 30_000);
});
