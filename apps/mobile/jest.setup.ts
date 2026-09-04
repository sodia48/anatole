import type { ReactNode } from "react";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "fr" }],
}));

jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn() }));

jest.mock("react-native-webview", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn(), postMessage: jest.fn(), reload: jest.fn() }), []);
    return React.createElement(View, props);
  });
  WebView.displayName = "MockWebView";
  return { WebView };
});

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => undefined) },
  useNetInfo: () => ({ isConnected: true }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
