import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "anatole.mobile.access-token";
const EXPIRES_AT_KEY = "anatole.mobile.expires-at";
const listeners = new Set<() => void>();

export const sessionStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: async (token: string, expiresAt?: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    if (expiresAt) await SecureStore.setItemAsync(EXPIRES_AT_KEY, expiresAt);
  },
  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(EXPIRES_AT_KEY),
    ]);
  },
};

export function onUnauthorized(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function handleUnauthorized(): Promise<void> {
  await sessionStore.clear();
  for (const listener of listeners) listener();
}
