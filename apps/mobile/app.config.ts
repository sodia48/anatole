import type { ConfigContext, ExpoConfig } from "expo/config";

const variant = process.env.APP_VARIANT ?? "development";
const isProduction = variant === "production";
const suffix = isProduction ? "" : variant === "preview" ? ".preview" : ".dev";
const label = isProduction ? "Anatole" : variant === "preview" ? "Anatole Preview" : "Anatole Dev";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: label,
  slug: "anatole-mobile",
  scheme: "anatole",
  version: "1.0.0",
  icon: "./assets/anatole-icon.png",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  ios: {
    supportsTablet: true,
    bundleIdentifier: `com.anatole.mobile${suffix}`,
    associatedDomains: ["applinks:anatole.app"],
  },
  android: {
    package: `com.anatole.mobile${suffix}`,
    adaptiveIcon: {
      foregroundImage: "./assets/anatole-icon.png",
      backgroundColor: "#071521",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "anatole.app", pathPrefix: "/stock" },
          { scheme: "https", host: "anatole.app", pathPrefix: "/focus" },
          { scheme: "https", host: "anatole.app", pathPrefix: "/alerts" },
          { scheme: "https", host: "anatole.app", pathPrefix: "/notifications" },
          { scheme: "https", host: "anatole.app", pathPrefix: "/portfolio" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/anatole-icon.png",
        imageWidth: 160,
        backgroundColor: "#050d15",
        dark: { image: "./assets/anatole-icon.png", backgroundColor: "#050d15" },
      },
    ],
    [
      "expo-notifications",
      {
        color: "#2c9cff",
        defaultChannel: "anatole-alerts",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: variant,
    apiUrl: process.env.EXPO_PUBLIC_ANATOLE_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "https://anatole-api.onrender.com",
    webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? "https://anatole.ca",
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "00000000-0000-0000-0000-000000000000",
    },
  },
});
