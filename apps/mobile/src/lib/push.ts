import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { notificationApi } from "./api/notifications";

const PUSH_TOKEN_KEY = "anatole.mobile.push-token";
const PUSH_DEVICE_ID_KEY = "anatole.mobile.push-device-id";

export function pushCapability(): { push_supported: boolean; reason: "expo-go" | "unsupported-platform" | "development-build" } {
  if (Constants.appOwnership === "expo") return { push_supported: false, reason: "expo-go" };
  if (!Device.isDevice || (Platform.OS !== "ios" && Platform.OS !== "android")) return { push_supported: false, reason: "unsupported-platform" };
  return { push_supported: true, reason: "development-build" };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function registerPushDevice(): Promise<string> {
  const capability = pushCapability();
  if (!capability.push_supported) {
    if (capability.reason === "expo-go") throw new Error("Expo Go prend uniquement en charge les notifications Anatole dans l’application.");
    throw new Error("Les notifications distantes exigent un appareil iOS ou Android réel.");
  }
  const nativePlatform = Platform.OS as "ios" | "android";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("anatole-alerts", {
      name: "Alertes Anatole",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#2c9cff",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Permission de notification refusée.");

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || String(projectId).startsWith("00000000")) {
    throw new Error("EXPO_PUBLIC_EAS_PROJECT_ID doit être configuré pour enregistrer le push.");
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: String(projectId) })).data;
  const device = await notificationApi.registerDevice({
    token,
    platform: nativePlatform,
    device_name: Device.deviceName ?? Device.modelName ?? undefined,
    app_version: Constants.expoConfig?.version,
  });
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  await AsyncStorage.setItem(PUSH_DEVICE_ID_KEY, device.id);
  return token;
}

export const registerForPushNotifications = registerPushDevice;

export async function unregisterPushDevice(): Promise<void> {
  const deviceId = await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (deviceId) await notificationApi.unregisterDevice(deviceId);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  await AsyncStorage.removeItem(PUSH_DEVICE_ID_KEY);
}
