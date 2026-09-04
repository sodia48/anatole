import type { SyncedWorkspaceData } from "@/src/lib/api/types";
import { completeOnboarding, explicitOnboardingAlerts, ONBOARDING_VERSION, shouldShowOnboarding, skipOnboarding, type OnboardingDraft } from "./model";

const workspace = (): SyncedWorkspaceData => ({
  watchlist: ["CNR"], portfolio: [], alerts: [],
  preferences: { theme: "dark", density: "comfortable", decimals: 2, default_range: "1y", default_universe: "tsx60", language: "fr" },
  cockpit_universe: "tsx60", comparator_symbols: [], focus_layouts: [], focus_scripts: [], terminal_presets: [],
});
const draft = (templates: OnboardingDraft["alertTemplates"] = []): OnboardingDraft => ({ language: "en", universe: "composite", symbols: ["RY", "TD", "BMO"], sectors: ["Financials"], regions: ["QC", "CA"], alertTemplates: templates });

it("appears on first launch and not after versioned completion", () => {
  expect(shouldShowOnboarding()).toBe(true);
  expect(shouldShowOnboarding(1)).toBe(true);
  expect(shouldShowOnboarding(ONBOARDING_VERSION)).toBe(false);
});

it("persists language, universe, watchlist, sectors and regions", () => {
  const result = completeOnboarding(workspace(), draft());
  expect(result.watchlist).toEqual(["CNR", "RY", "TD", "BMO"]);
  expect(result.cockpit_universe).toBe("composite");
  expect(result.preferences).toEqual(expect.objectContaining({ language: "en", default_universe: "composite", preferred_sectors: ["Financials"], preferred_regions: ["QC", "CA"], onboarding_version: 2 }));
});

it("creates optional alerts only after explicit selection", () => {
  expect(explicitOnboardingAlerts(draft())).toEqual([]);
  const selected = explicitOnboardingAlerts(draft(["earnings_upcoming"]));
  expect(selected).toHaveLength(3);
  expect(selected.every((item) => item.event_type === "earnings_upcoming" && item.enabled)).toBe(true);
});

it("skip marks completion without changing anonymous workspace choices", () => {
  const current = workspace();
  expect(skipOnboarding(current)).toEqual({ ...current, preferences: { ...current.preferences, onboarding_version: 2 } });
});
