import { apiRequest } from "./base";
import type { MobileDevice, NotificationFeed } from "./types";

export const notificationApi = {
  feed: () => apiRequest<NotificationFeed>("/api/v1/notifications/feed", { auth: true }),
  markRead: (id: string) => apiRequest<void>(`/api/v1/notifications/feed/${encodeURIComponent(id)}/read`, { method: "POST", auth: true }),
  markAllRead: () => apiRequest<void>("/api/v1/notifications/read-all", { method: "POST", auth: true }),
  registerDevice: (payload: { token: string; platform: "ios" | "android"; device_name?: string; app_version?: string }) => apiRequest<MobileDevice>("/api/v1/account/devices", { method: "POST", auth: true, body: JSON.stringify(payload) }),
  devices: () => apiRequest<MobileDevice[]>("/api/v1/account/devices", { auth: true }),
  unregisterDevice: (deviceId: string) => apiRequest<void>(`/api/v1/account/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE", auth: true }),
};
