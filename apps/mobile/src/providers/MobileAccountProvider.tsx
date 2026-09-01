import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { accountApi } from "@/src/lib/api/account";
import { ApiError } from "@/src/lib/api/base";
import { onUnauthorized, sessionStore } from "@/src/lib/api/session";
import type { AccountUser, SyncedWorkspaceData, WorkspaceSnapshot } from "@/src/lib/api/types";
import { mergeWorkspaceData } from "@/src/lib/workspaceMerge";

export type AccountState = "booting" | "anonymous" | "authenticated";

const emptyWorkspaceData = (): SyncedWorkspaceData => ({
  watchlist: [],
  portfolio: [],
  alerts: [],
  preferences: {
    theme: "dark",
    density: "comfortable",
    decimals: 2,
    default_range: "1y",
    default_universe: "tsx60",
    language: "fr",
  },
  advisor_profile: null,
  cockpit_universe: "tsx60",
  comparator_symbols: [],
  focus_layouts: [],
  focus_scripts: [],
  terminal_presets: [],
});

type MobileAccountValue = {
  state: AccountState;
  user: AccountUser | null;
  workspace: WorkspaceSnapshot;
  workspaceError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName?: string; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  saveWorkspace: (data: SyncedWorkspaceData) => Promise<void>;
};

const MobileAccountContext = createContext<MobileAccountValue | null>(null);

export function MobileAccountProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AccountState>("booting");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>({ revision: 0, data: emptyWorkspaceData(), updated_at: null });
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const becomeAnonymous = useCallback(() => {
    setUser(null);
    setWorkspace({ revision: 0, data: emptyWorkspaceData(), updated_at: null });
    setWorkspaceError(null);
    setState("anonymous");
  }, []);

  const clearPrivateState = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => ["notifications", "portfolio", "alerts", "watchlist"].includes(String(query.queryKey[0])),
    });
    becomeAnonymous();
  }, [becomeAnonymous, queryClient]);

  useEffect(() => onUnauthorized(() => {
    clearPrivateState();
    router.replace("/(auth)/login");
  }), [clearPrivateState]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await sessionStore.get();
      if (!token) {
        if (active) becomeAnonymous();
        return;
      }
      try {
        const status = await accountApi.me();
        if (!active) return;
        setUser(status.user);
        setState("authenticated");
        try {
          const remoteWorkspace = await accountApi.workspace();
          if (active) {
            setWorkspace(remoteWorkspace);
            setWorkspaceError(null);
          }
        } catch (error) {
          if (active) setWorkspaceError(error instanceof Error ? error.message : "Synchronisation indisponible.");
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status !== 401) {
          setWorkspaceError(error.message);
        }
        clearPrivateState();
      }
    })();
    return () => { active = false; };
  }, [becomeAnonymous, clearPrivateState]);

  const applySession = useCallback(async (session: Awaited<ReturnType<typeof accountApi.login>>) => {
    await sessionStore.set(session.token, session.expires_at);
    setUser(session.user);
    setWorkspaceError(null);
    setState("authenticated");
    const merged = mergeWorkspaceData(session.workspace.data, workspace.data);
    if (JSON.stringify(merged) === JSON.stringify(session.workspace.data)) {
      setWorkspace(session.workspace);
      return;
    }
    const localMerged = { ...session.workspace, data: merged };
    setWorkspace(localMerged);
    try {
      setWorkspace(await accountApi.updateWorkspace(localMerged));
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Synchronisation indisponible.");
    }
  }, [workspace.data]);

  const value = useMemo<MobileAccountValue>(() => ({
    state,
    user,
    workspace,
    workspaceError,
    async login(email, password) {
      await applySession(await accountApi.login(email.trim().toLowerCase(), password));
    },
    async register(input) {
      await applySession(await accountApi.register(input));
    },
    async logout() {
      try {
        await accountApi.logout();
      } finally {
        await sessionStore.clear();
        clearPrivateState();
      }
    },
    async saveWorkspace(data) {
      if (state !== "authenticated") {
        setWorkspace((current) => ({ ...current, data }));
        return;
      }
      try {
        const saved = await accountApi.updateWorkspace({ ...workspace, data });
        setWorkspace(saved);
        setWorkspaceError(null);
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : "Synchronisation indisponible.");
        throw error;
      }
    },
  }), [applySession, clearPrivateState, state, user, workspace, workspaceError]);

  return <MobileAccountContext.Provider value={value}>{children}</MobileAccountContext.Provider>;
}

export function useMobileAccount(): MobileAccountValue {
  const context = useContext(MobileAccountContext);
  if (!context) throw new Error("useMobileAccount must be used inside MobileAccountProvider");
  return context;
}
