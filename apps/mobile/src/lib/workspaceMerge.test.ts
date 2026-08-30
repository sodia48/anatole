import type { SyncedWorkspaceData } from "./api/types";
import { mergeWorkspaceData } from "./workspaceMerge";

const workspace = (watchlist: string[]): SyncedWorkspaceData => ({
  watchlist, portfolio: [], alerts: [], preferences: { theme: "dark", density: "comfortable", decimals: 2, default_range: "1y", default_universe: "tsx60", language: "fr" },
  cockpit_universe: "tsx60", comparator_symbols: [], focus_layouts: [], focus_scripts: [],
});

it("merges local discovery symbols with the remote account workspace", () => {
  const merged = mergeWorkspaceData(workspace(["RY", "TD"]), workspace(["ry.to", "CNR"]));
  expect(merged.watchlist).toEqual(["RY", "TD", "CNR"]);
});
