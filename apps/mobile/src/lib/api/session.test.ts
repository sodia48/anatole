import * as SecureStore from "expo-secure-store";

import { sessionStore } from "./session";

const secureStore = jest.mocked(SecureStore);

describe("sessionStore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores both the bearer token and expiry in SecureStore", async () => {
    await sessionStore.set("secret-token", "2030-01-01T00:00:00Z");
    expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(1, "anatole.mobile.access-token", "secret-token");
    expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(2, "anatole.mobile.expires-at", "2030-01-01T00:00:00Z");
  });

  it("clears both secure session values", async () => {
    await sessionStore.clear();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("anatole.mobile.access-token");
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("anatole.mobile.expires-at");
  });
});
