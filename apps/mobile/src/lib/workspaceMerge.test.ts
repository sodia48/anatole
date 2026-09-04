import type { SyncedWorkspaceData } from "./api/types";
import { mergeWorkspaceData } from "./workspaceMerge";

const workspace = (watchlist: string[]): SyncedWorkspaceData => ({
  watchlist, portfolio: [], alerts: [], preferences: { theme: "dark", density: "comfortable", decimals: 2, default_range: "1y", default_universe: "tsx60", language: "fr" },
  cockpit_universe: "tsx60", comparator_symbols: [], focus_layouts: [], focus_scripts: [], terminal_presets: [],
});

it("keeps and updates Terminal presets without losing other workspace data", () => {
  const remote = workspace(["RY"]);
  remote.terminal_presets = [{ id: "leaders", name: "Leaders", filters: { score_min: 72 }, sort: "score_desc" }];
  const local = workspace(["TD"]);
  local.terminal_presets = [
    { id: "leaders", name: "Mes leaders", filters: { score_min: 75 }, sort: "score_desc" },
    { id: "volume", name: "Volume", filters: { relative_volume_min: 1.5 }, sort: "volume_desc" },
  ];
  const merged = mergeWorkspaceData(remote, local);
  expect(merged.watchlist).toEqual(["RY", "TD"]);
  expect(merged.terminal_presets).toHaveLength(2);
  expect(merged.terminal_presets[0]?.name).toBe("Mes leaders");
});

it("merges local discovery symbols with the remote account workspace", () => {
  const merged = mergeWorkspaceData(workspace(["RY", "TD"]), workspace(["ry.to", "CNR"]));
  expect(merged.watchlist).toEqual(["RY", "TD", "CNR"]);
});

it("carries a completed anonymous onboarding into a new account workspace", () => {
  const remote = workspace([]);
  const local = workspace(["RY", "TD", "BMO"]);
  local.preferences = { ...local.preferences, language: "en", preferred_regions: ["QC"], preferred_sectors: ["Financials"], onboarding_version: 2 };
  const merged = mergeWorkspaceData(remote, local);
  expect(merged.preferences).toEqual(expect.objectContaining({ language: "en", preferred_regions: ["QC"], preferred_sectors: ["Financials"], onboarding_version: 2 }));
});
