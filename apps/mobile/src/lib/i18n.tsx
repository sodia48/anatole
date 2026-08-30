import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

export type Language = "fr" | "en";

const strings = {
  fr: {
    today: "Aujourd’hui",
    markets: "Marchés",
    focus: "Focus",
    portfolio: "Portefeuille",
    more: "Plus",
    watchlist: "Watchlist",
    alerts: "Alertes",
    notifications: "Notifications",
    settings: "Réglages",
    login: "Se connecter",
    register: "Créer un compte",
    logout: "Se déconnecter",
    retry: "Réessayer",
    loading: "Chargement…",
    offline: "Données mises en cache · connexion indisponible",
    noData: "Aucune donnée disponible pour le moment.",
    search: "Rechercher un titre",
    greeting: "Bonjour",
    marketPulse: "Pouls du marché",
    gainers: "Meilleures hausses",
    losers: "Plus fortes baisses",
    news: "Dernières nouvelles",
    earnings: "Résultats à venir",
    calendar: "Calendrier économique",
    seeAll: "Tout voir",
    anonymous: "Mode découverte",
    signInToSync: "Connectez-vous pour synchroniser vos données Anatole.",
  },
  en: {
    today: "Today",
    markets: "Markets",
    focus: "Focus",
    portfolio: "Portfolio",
    more: "More",
    watchlist: "Watchlist",
    alerts: "Alerts",
    notifications: "Notifications",
    settings: "Settings",
    login: "Sign in",
    register: "Create account",
    logout: "Sign out",
    retry: "Try again",
    loading: "Loading…",
    offline: "Cached data · connection unavailable",
    noData: "No data is available yet.",
    search: "Search a security",
    greeting: "Hello",
    marketPulse: "Market pulse",
    gainers: "Top gainers",
    losers: "Top losers",
    news: "Latest news",
    earnings: "Upcoming earnings",
    calendar: "Economic calendar",
    seeAll: "See all",
    anonymous: "Discovery mode",
    signInToSync: "Sign in to sync your Anatole data.",
  },
} as const;

type StringKey = keyof typeof strings.fr;
type LocaleContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: StringKey) => string;
  pick: (fr: string, en: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const LANGUAGE_KEY = "anatole.mobile.language";

function deviceLanguage(): Language {
  return getLocales()[0]?.languageCode === "en" ? "en" : "fr";
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(deviceLanguage);

  useEffect(() => {
    void AsyncStorage.getItem(LANGUAGE_KEY).then((saved) => {
      if (saved === "fr" || saved === "en") setLanguageState(saved);
    });
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    language,
    setLanguage(next) {
      setLanguageState(next);
      void AsyncStorage.setItem(LANGUAGE_KEY, next);
    },
    t: (key) => strings[language][key],
    pick: (fr, en) => language === "fr" ? fr : en,
  }), [language]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}
