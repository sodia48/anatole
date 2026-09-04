import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { accountApi } from "@/src/lib/api/account";
import { ApiError } from "@/src/lib/api/base";
import { onUnauthorized, sessionStore } from "@/src/lib/api/session";
import type { AccountUser, SyncedWorkspaceData, WorkspaceSnapshot } from "@/src/lib/api/types";
import { appendWorkspaceActions, clearLocalWorkspace, deriveWorkspaceActions, loadLocalWorkspace, persistLocalWorkspace, replayWorkspaceQueue } from "@/src/lib/offlineWorkspace";
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
    preferred_regions: [],
    preferred_sectors: [],
    onboarding_version: 0,
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
  const workspaceRef = useRef(workspace);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const setAndPersistWorkspace = useCallback((next: WorkspaceSnapshot) => {
    workspaceRef.current = next;
    setWorkspace(next);
    void persistLocalWorkspace(next);
  }, []);

  const becomeAnonymous = useCallback((reset = false) => {
    setUser(null);
    if (reset) {
      const empty = { revision: 0, data: emptyWorkspaceData(), updated_at: null };
      workspaceRef.current = empty;
      setWorkspace(empty);
    }
    setWorkspaceError(null);
    setState("anonymous");
  }, []);

  const clearPrivateState = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => ["notifications", "portfolio", "alerts", "watchlist"].includes(String(query.queryKey[0])),
    });
    void clearLocalWorkspace();
    becomeAnonymous(true);
  }, [becomeAnonymous, queryClient]);

  const flushQueuedWorkspace = useCallback(async (remote?: WorkspaceSnapshot) => {
    try {
      const saved = await replayWorkspaceQueue(
        remote ? async () => remote : accountApi.workspace,
        accountApi.updateWorkspace,
      );
      if (saved) setAndPersistWorkspace(saved);
      else if (remote) setAndPersistWorkspace(remote);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Synchronisation indisponible.");
    }
  }, [setAndPersistWorkspace]);

  const revalidateSession = useCallback(async () => {
    try {
      const status = await accountApi.me();
      setUser(status.user);
      setState("authenticated");
      const remoteWorkspace = await accountApi.workspace();
      await flushQueuedWorkspace(remoteWorkspace);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearPrivateState();
        return;
      }
      setState("authenticated");
      setWorkspaceError(error instanceof Error ? error.message : "Connexion indisponible.");
    }
  }, [clearPrivateState, flushQueuedWorkspace]);

  useEffect(() => onUnauthorized(() => {
    clearPrivateState();
    router.replace("/(auth)/login");
  }), [clearPrivateState]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const localWorkspace = await loadLocalWorkspace();
      if (active && localWorkspace) {
        workspaceRef.current = localWorkspace;
        setWorkspace(localWorkspace);
      }
      const token = await sessionStore.get();
      if (!token) {
        if (active) becomeAnonymous();
        return;
      }
      if (active) setState("authenticated");
      await revalidateSession();
    })();
    return () => { active = false; };
  }, [becomeAnonymous, revalidateSession]);

  useEffect(() => onlineManager.subscribe((online) => {
    if (online && state === "authenticated") void revalidateSession();
  }), [revalidateSession, state]);

  const applySession = useCallback(async (session: Awaited<ReturnType<typeof accountApi.login>>) => {
    await sessionStore.set(session.token, session.expires_at);
    setUser(session.user);
    setWorkspaceError(null);
    setState("authenticated");
    const merged = mergeWorkspaceData(session.workspace.data, workspaceRef.current.data);
    if (JSON.stringify(merged) === JSON.stringify(session.workspace.data)) {
      setAndPersistWorkspace(session.workspace);
      return;
    }
    const localMerged = { ...session.workspace, data: merged };
    setAndPersistWorkspace(localMerged);
    try {
      setAndPersistWorkspace(await accountApi.updateWorkspace(localMerged));
    } catch (error) {
      await appendWorkspaceActions(deriveWorkspaceActions(session.workspace.data, merged));
      setWorkspaceError(error instanceof Error ? error.message : "Synchronisation indisponible.");
    }
  }, [setAndPersistWorkspace]);

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
      const previous = workspaceRef.current;
      const local = { ...previous, data, updated_at: new Date().toISOString() };
      const actions = deriveWorkspaceActions(previous.data, data);
      setAndPersistWorkspace(local);
      if (state !== "authenticated" || !actions.length) return;
      await appendWorkspaceActions(actions);
      if (onlineManager.isOnline() === false) {
        setWorkspaceError("Synchronisation en attente de réseau.");
        return;
      }
      try {
        await flushQueuedWorkspace();
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : "Synchronisation indisponible.");
      }
    },
  }), [applySession, clearPrivateState, flushQueuedWorkspace, setAndPersistWorkspace, state, user, workspace, workspaceError]);

  return <MobileAccountContext.Provider value={value}>{children}</MobileAccountContext.Provider>;
}

export function useMobileAccount(): MobileAccountValue {
  const context = useContext(MobileAccountContext);
  if (!context) throw new Error("useMobileAccount must be used inside MobileAccountProvider");
  return context;
}
