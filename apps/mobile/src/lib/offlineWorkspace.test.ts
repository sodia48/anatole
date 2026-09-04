import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SyncedWorkspaceData, WorkspaceSnapshot } from "./api/types";
import { appendWorkspaceActions, applyWorkspaceActions, deriveWorkspaceActions, loadWorkspaceQueue, replayWorkspaceQueue, WORKSPACE_QUEUE_KEY } from "./offlineWorkspace";

const workspace = (): SyncedWorkspaceData => ({
  watchlist: [], portfolio: [], alerts: [],
  preferences: { theme: "dark", density: "comfortable", decimals: 2, default_range: "1y", default_universe: "composite", language: "fr", preferred_regions: [], preferred_sectors: [], onboarding_version: 0 },
  cockpit_universe: "composite", comparator_symbols: [], focus_layouts: [], focus_scripts: [], terminal_presets: [],
});

beforeEach(async () => { await AsyncStorage.clear(); });

it("derives and replays queued watchlist, portfolio and alert actions", () => {
  const before = workspace();
  before.alerts = [{ id: "a1", symbol: "RY", enabled: true, metric: "price", operator: "above", threshold: 200 }];
  const after = workspace();
  after.watchlist = ["RY"];
  after.portfolio = [{ symbol: "TD", quantity: 2, average_cost: 75 }];
  after.alerts = [{ ...before.alerts[0]!, enabled: false }];
  const actions = deriveWorkspaceActions(before, after);
  expect(actions.map((item) => item.kind)).toEqual(["watchlist:add", "portfolio:upsert", "alert:toggle"]);
  expect(applyWorkspaceActions(before, actions)).toEqual(after);
});

it("replays actions over the latest server revision and clears only after success", async () => {
  const local = workspace(); local.watchlist = ["RY"];
  await appendWorkspaceActions(deriveWorkspaceActions(workspace(), local));
  const remote: WorkspaceSnapshot = { revision: 7, updated_at: null, data: workspace() };
  remote.data.watchlist = ["TD"];
  const save = jest.fn(async (input: WorkspaceSnapshot) => ({ ...input, revision: 8 }));
  const result = await replayWorkspaceQueue(async () => remote, save);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ revision: 7, data: expect.objectContaining({ watchlist: ["TD", "RY"] }) }));
  expect(result?.revision).toBe(8);
  expect(await loadWorkspaceQueue()).toEqual([]);
});

it("retains the action queue after a failed sync", async () => {
  const local = workspace(); local.portfolio = [{ symbol: "CNR", quantity: 1, average_cost: 150 }];
  await appendWorkspaceActions(deriveWorkspaceActions(workspace(), local));
  await expect(replayWorkspaceQueue(
    async () => ({ revision: 3, updated_at: null, data: workspace() }),
    async () => { throw new Error("503"); },
  )).rejects.toThrow("503");
  expect((await loadWorkspaceQueue()).map((item) => item.kind)).toEqual(["portfolio:upsert"]);
  expect(await AsyncStorage.getItem(WORKSPACE_QUEUE_KEY)).not.toBeNull();
});
