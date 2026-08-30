/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_ANATOLE_API_URL?: string;
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_WEB_URL?: string;
    EXPO_PUBLIC_EAS_PROJECT_ID?: string;
    APP_VARIANT?: "development" | "preview" | "production";
  }
}
