import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "anatole.mobile.access-token";
const EXPIRES_AT_KEY = "anatole.mobile.expires-at";
const listeners = new Set<() => void>();
let sessionWrites: Promise<unknown> = Promise.resolve();

function queueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = sessionWrites.then(operation, operation);
  sessionWrites = result.then(() => undefined, () => undefined);
  return result;
}

export const sessionStore = {
  get: async () => {
    await sessionWrites;
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  set: (token: string, expiresAt?: string) => queueWrite(async () => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    if (expiresAt) await SecureStore.setItemAsync(EXPIRES_AT_KEY, expiresAt);
  }),
  clear: () => queueWrite(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(EXPIRES_AT_KEY),
    ]);
  }),
  clearIfCurrent: (expectedToken: string | null) => queueWrite(async () => {
    if (!expectedToken || await SecureStore.getItemAsync(TOKEN_KEY) !== expectedToken) return false;
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(EXPIRES_AT_KEY),
    ]);
    return true;
  }),
};

export function onUnauthorized(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function handleUnauthorized(expectedToken: string | null): Promise<void> {
  if (!await sessionStore.clearIfCurrent(expectedToken)) return;
  for (const listener of listeners) listener();
}
