"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AccountSession,
  type AccountUser,
  type WorkspaceSnapshot,
  WorkspaceConflict,
  getAccountStatus,
  getRemoteWorkspace,
  loginAccount,
  logoutAccount,
  logoutAllAccounts,
  putRemoteWorkspace,
  registerAccount,
  deleteAccount,
} from "@/lib/account";
import {
  type SyncedWorkspaceData,
  mergeWorkspace,
  readLocalWorkspace,
  workspaceFingerprint,
  writeLocalWorkspace,
} from "@/lib/workspace-sync";

export type AccountSyncState =
  | "anonymous"
  | "connecting"
  | "syncing"
  | "synced"
  | "offline"
  | "error";

type AccountContextValue = {
  user: AccountUser | null;
  hydrated: boolean;
  syncState: AccountSyncState;
  workspaceRevision: number;
  lastSyncedAt: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  syncNow: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  deleteMyAccount: (password: string) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function fullyPresent(data: SyncedWorkspaceData) {
  return {
    data,
    present: {
      watchlist: true,
      portfolio: true,
      alerts: true,
      preferences: true,
      advisor_profile: true,
      cockpit_universe: true,
      comparator_symbols: true,
    },
  } as const;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<AccountSyncState>("anonymous");
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const lastFingerprintRef = useRef("");
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rememberWorkspace = useCallback((workspace: WorkspaceSnapshot) => {
    revisionRef.current = workspace.revision;
    if (!mountedRef.current) return;
    setWorkspaceRevision(workspace.revision);
    setLastSyncedAt(workspace.updated_at ?? new Date().toISOString());
    lastFingerprintRef.current = workspaceFingerprint(workspace.data);
  }, []);

  const saveWorkspace = useCallback(async (
    expectedRevision: number,
    data: SyncedWorkspaceData,
  ): Promise<WorkspaceSnapshot> => {
    try {
      return await putRemoteWorkspace(expectedRevision, data);
    } catch (reason) {
      if (!(reason instanceof WorkspaceConflict)) throw reason;
      const remote = await getRemoteWorkspace();
      const merged = mergeWorkspace(remote.data, fullyPresent(data));
      writeLocalWorkspace(merged);
      return await putRemoteWorkspace(remote.revision, merged);
    }
  }, []);

  const pushLocal = useCallback(async () => {
    if (syncingRef.current || !user) return;
    syncingRef.current = true;
    setSyncState("syncing");
    setError(null);

    try {
      const local = readLocalWorkspace();
      const saved = await saveWorkspace(revisionRef.current, local.data);
      rememberWorkspace(saved);
      setSyncState("synced");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Synchronisation indisponible.";
      setError(message);
      setSyncState(online() ? "error" : "offline");
      throw reason;
    } finally {
      syncingRef.current = false;
    }
  }, [rememberWorkspace, saveWorkspace, user]);

  const activateSession = useCallback(async (session: AccountSession) => {
    setUser(session.user);
    revisionRef.current = session.workspace.revision;
    setWorkspaceRevision(session.workspace.revision);

    const local = readLocalWorkspace();
    const merged = mergeWorkspace(session.workspace.data, local);
    writeLocalWorkspace(merged);
    setLastSyncedAt(session.workspace.updated_at);

    if (workspaceFingerprint(merged) === workspaceFingerprint(session.workspace.data)) {
      rememberWorkspace(session.workspace);
      setSyncState("synced");
      return;
    }

    setSyncState("syncing");
    try {
      const saved = await saveWorkspace(session.workspace.revision, merged);
      rememberWorkspace(saved);
      setSyncState("synced");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Compte connecté, synchronisation en attente.";
      setError(message);
      setSyncState(online() ? "error" : "offline");
    }
  }, [rememberWorkspace, saveWorkspace]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      setSyncState("connecting");
      try {
        const [status, remote] = await Promise.all([
          getAccountStatus(),
          getRemoteWorkspace(),
        ]);
        if (cancelled) return;
        setUser(status.user);
        revisionRef.current = remote.revision;
        setWorkspaceRevision(remote.revision);

        const local = readLocalWorkspace();
        const merged = mergeWorkspace(remote.data, local);
        writeLocalWorkspace(merged);
        const saved = workspaceFingerprint(merged) === workspaceFingerprint(remote.data)
          ? remote
          : await saveWorkspace(remote.revision, merged);
        if (cancelled) return;
        rememberWorkspace(saved);
        setSyncState("synced");
      } catch (reason) {
        if (cancelled) return;
        const status = reason instanceof Error ? reason.message : "";
        setUser(null);
        setWorkspaceRevision(0);
        setLastSyncedAt(null);
        setError(status.includes("Connexion requise") ? null : status || null);
        setSyncState("anonymous");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [rememberWorkspace, saveWorkspace]);

  useEffect(() => {
    if (!user) return;

    const checkLocalChanges = () => {
      if (syncingRef.current || !online()) return;
      const current = readLocalWorkspace().data;
      if (workspaceFingerprint(current) !== lastFingerprintRef.current) {
        void pushLocal().catch(() => undefined);
      }
    };

    const pullRemote = async () => {
      if (syncingRef.current || !online()) return;
      const current = readLocalWorkspace().data;
      if (workspaceFingerprint(current) !== lastFingerprintRef.current) return;
      try {
        const remote = await getRemoteWorkspace();
        if (remote.revision > revisionRef.current) {
          writeLocalWorkspace(remote.data);
          rememberWorkspace(remote);
          setSyncState("synced");
        }
      } catch {
        setSyncState(online() ? "error" : "offline");
      }
    };

    const localTimer = window.setInterval(checkLocalChanges, 5_000);
    const remoteTimer = window.setInterval(() => void pullRemote(), 45_000);
    const onStorage = () => checkLocalChanges();
    const onOnline = () => {
      setSyncState("syncing");
      checkLocalChanges();
      void pullRemote();
    };
    const onOffline = () => setSyncState("offline");

    window.addEventListener("storage", onStorage);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(localTimer);
      window.clearInterval(remoteTimer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [pushLocal, rememberWorkspace, user]);

  const clearAccountState = useCallback(() => {
    setUser(null);
    setWorkspaceRevision(0);
    setLastSyncedAt(null);
    setError(null);
    setSyncState("anonymous");
    revisionRef.current = 0;
    lastFingerprintRef.current = "";
  }, []);

  const value = useMemo<AccountContextValue>(() => ({
    user,
    hydrated,
    syncState,
    workspaceRevision,
    lastSyncedAt,
    error,
    signIn: async (email, password) => {
      setSyncState("connecting");
      setError(null);
      try {
        await activateSession(await loginAccount({ email, password }));
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Connexion impossible.";
        setError(message);
        setSyncState("error");
        throw reason;
      }
    },
    register: async (email, password, displayName) => {
      setSyncState("connecting");
      setError(null);
      try {
        await activateSession(await registerAccount({
          email,
          password,
          display_name: displayName,
        }));
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Création du compte impossible.";
        setError(message);
        setSyncState("error");
        throw reason;
      }
    },
    signOut: async () => {
      clearAccountState();
      await logoutAccount().catch(() => undefined);
    },
    signOutEverywhere: async () => {
      await logoutAllAccounts().catch(() => undefined);
      clearAccountState();
    },
    syncNow: async () => {
      await pushLocal();
    },
    refreshAccount: async () => {
      const status = await getAccountStatus();
      setUser(status.user);
    },
    deleteMyAccount: async (password) => {
      await deleteAccount({ password, confirmation: "SUPPRIMER" });
      clearAccountState();
    },
  }), [
    activateSession,
    clearAccountState,
    error,
    hydrated,
    lastSyncedAt,
    pushLocal,
    syncState,
    user,
    workspaceRevision,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount doit être utilisé dans AccountProvider");
  return value;
}

