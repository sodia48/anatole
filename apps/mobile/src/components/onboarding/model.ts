import type { AlertRule, SyncedWorkspaceData } from "@/src/lib/api/types";

export const ONBOARDING_VERSION = 2;

export type OnboardingDraft = {
  language: "fr" | "en";
  universe: "tsx60" | "composite";
  symbols: string[];
  sectors: string[];
  regions: string[];
  alertTemplates: ("earnings_upcoming" | "company_news")[];
};

export function shouldShowOnboarding(version?: number): boolean {
  return (version ?? 0) < ONBOARDING_VERSION;
}

export function explicitOnboardingAlerts(draft: OnboardingDraft): AlertRule[] {
  return draft.alertTemplates.flatMap((eventType) => draft.symbols.slice(0, 5).map((symbol) => ({
    id: `onboarding-${eventType}-${symbol}`,
    symbol,
    kind: "event" as const,
    event_type: eventType,
    enabled: true,
    cooldown_minutes: 1_440,
    label: eventType === "earnings_upcoming" ? `Earnings · ${symbol}` : `News · ${symbol}`,
  })));
}

export function completeOnboarding(current: SyncedWorkspaceData, draft: OnboardingDraft): SyncedWorkspaceData {
  const watchlist = [...new Set([...current.watchlist, ...draft.symbols])].slice(0, 30);
  const newAlerts = explicitOnboardingAlerts(draft);
  const alertIds = new Set(newAlerts.map((item) => item.id));
  return {
    ...current,
    watchlist,
    alerts: [...current.alerts.filter((item) => !alertIds.has(item.id)), ...newAlerts].slice(0, 50),
    cockpit_universe: draft.universe,
    preferences: {
      ...current.preferences,
      language: draft.language,
      default_universe: draft.universe,
      preferred_regions: draft.regions,
      preferred_sectors: draft.sectors,
      onboarding_version: ONBOARDING_VERSION,
    },
  };
}

export function skipOnboarding(current: SyncedWorkspaceData): SyncedWorkspaceData {
  return { ...current, preferences: { ...current.preferences, onboarding_version: ONBOARDING_VERSION } };
}
