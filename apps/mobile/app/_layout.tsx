import { Stack, router, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProviders } from "@/src/providers/AppProviders";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { useLocale } from "@/src/lib/i18n";
import { colors } from "@/src/theme/tokens";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

void SplashScreen.preventAutoHideAsync();

function NotificationNavigation() {
  useMobileTheme();
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      if (typeof data.ticker === "string") {
        router.push({ pathname: "/focus/[ticker]", params: { ticker: data.ticker } });
      } else if (typeof data.route === "string" && data.route.startsWith("/")) {
        router.push(data.route as Href);
      } else {
        router.push("/notifications");
      }
    });
    return () => subscription.remove();
  }, []);
  return null;
}

export default function RootLayout() {
  useMobileTheme();
  return <AppProviders><ThemedRoot /></AppProviders>;
}

function ThemedRoot() {
  const { colors: themeColors, isSky } = useMobileTheme();
  const { state } = useMobileAccount();
  useEffect(() => { if (state !== "booting") void SplashScreen.hideAsync(); }, [state]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <NotificationNavigation />
      <StatusBar style={isSky ? "dark" : "light"} />
      <AppStack />
    </GestureHandlerRootView>
  );
}

function AppStack() {
  useMobileTheme();
  const { pick } = useLocale();
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background }, headerBackButtonDisplayMode: "minimal" }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="appearance" options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: "modal" }} />
    <Stack.Screen name="article" options={{ headerShown: false, gestureEnabled: true }} />
    <Stack.Screen name="stock/[ticker]" options={{ title: "Focus", orientation: "all" }} />
    <Stack.Screen name="focus/[ticker]" options={{ title: "Focus" }} />
    <Stack.Screen name="etf/index" options={{ title: pick("ETF canadiens", "Canadian ETFs") }} />
    <Stack.Screen name="etf/[ticker]" options={{ title: "ETF" }} />
    <Stack.Screen name="screener/index" options={{ title: "Screener" }} />
    <Stack.Screen name="terminal/index" options={{ title: "Terminal Pro" }} />
    <Stack.Screen name="psychology/index" options={{ title: pick("Psychologie", "Psychology") }} />
    <Stack.Screen name="ipo-insiders/index" options={{ title: pick("IPO & initiés", "IPOs & insiders") }} />
    <Stack.Screen name="notifications" options={{ title: pick("Notifications", "Notifications") }} />
    <Stack.Screen name="alerts" options={{ title: pick("Alertes", "Alerts") }} />
    <Stack.Screen name="watchlist" options={{ title: "Watchlist" }} />
    <Stack.Screen name="compare" options={{ title: pick("Comparateur", "Comparator") }} />
    <Stack.Screen name="search" options={{ title: pick("Recherche", "Search") }} />
    <Stack.Screen name="discover" options={{ title: pick("Découvrir", "Discover") }} />
    <Stack.Screen name="assistant" options={{ title: "Assistant Anatole" }} />
    <Stack.Screen name="network/[ticker]" options={{ title: pick("Réseau d’entreprise", "Company network") }} />
    <Stack.Screen name="settings" options={{ title: pick("Réglages", "Settings") }} />
  </Stack>;
}
