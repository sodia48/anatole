import { deleteTerminalPreset, filterTerminalRadar, upsertTerminalPreset } from "@anatole/shared";

import type { TerminalRadarFilters, TerminalRadarItem, TerminalRadarPreset } from "@/src/lib/api/types";
import { terminalFilterLabels } from "./TerminalRadarFiltersModal";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

const base: TerminalRadarItem = {
  symbol: "RY", name: "Royal Bank", sector: "Financials", price: 200, change_percent: 2,
  momentum_20d: 8, rsi_14: 35, relative_volume: 2, score: 80, signal: "Constructif",
  opportunity_type: "Leadership", reasons: [], volume: 2_000_000, average_volume_20d: 1_000_000,
  sma_20: 195, sma_50: 190, trend: "Haussière", source: "yahoo-public", delayed: true,
  anomaly_types: ["volume_spike"],
};

const completeFilters: TerminalRadarFilters = {
  score_min: 70, score_max: 90, momentum_20d_min: 5, momentum_20d_max: 10,
  relative_volume_min: 1.5, rsi_min: 30, rsi_max: 40, change_percent_min: 1,
  change_percent_max: 3, sector: "Financials", trend: "Haussière", signal: "Constructif",
  anomaly_types: ["volume_spike"],
};

describe("Terminal Radar shared filters", () => {
  it("applies every supported criterion locally", () => {
    expect(filterTerminalRadar([base], completeFilters)).toEqual([base]);
    const failures: TerminalRadarItem[] = [
      { ...base, score: 69 }, { ...base, score: 91 }, { ...base, momentum_20d: 4 }, { ...base, momentum_20d: 11 },
      { ...base, relative_volume: 1.4 }, { ...base, rsi_14: 29 }, { ...base, rsi_14: 41 },
      { ...base, change_percent: 0 }, { ...base, change_percent: 4 }, { ...base, sector: "Energy" },
      { ...base, trend: "Mixte" }, { ...base, signal: "Neutre" }, { ...base, anomaly_types: ["gap"] },
    ];
    for (const item of failures) expect(filterTerminalRadar([item], completeFilters)).toEqual([]);
  });

  it("does not reinterpret unavailable values as zero", () => {
    const unavailable = { ...base, rsi_14: null, score: null as unknown as number };
    expect(filterTerminalRadar([unavailable], { rsi_min: 0 })).toEqual([]);
    expect(filterTerminalRadar([unavailable], { score_min: 0 })).toEqual([]);
  });

  it("round-trips, edits and deletes a complete preset", () => {
    const original: TerminalRadarPreset = { id: "complete", name: "Radar complet", filters: completeFilters, sort: "score_desc" };
    const saved = upsertTerminalPreset([], original);
    expect(saved[0]?.filters).toEqual(completeFilters);
    const edited = upsertTerminalPreset(saved, { ...original, name: "Radar modifié", filters: { ...completeFilters, rsi_max: 42 } });
    expect(edited).toHaveLength(1);
    expect(edited[0]).toEqual(expect.objectContaining({ name: "Radar modifié", filters: expect.objectContaining({ rsi_max: 42, trend: "Haussière", relative_volume_min: 1.5, anomaly_types: ["volume_spike"] }) }));
    expect(deleteTerminalPreset(edited, "complete")).toEqual([]);
  });

  it("localizes active filter chips in French and English", () => {
    const filters: TerminalRadarFilters = { trend: "Haussière", signal: "Sous pression", anomaly_types: ["volume_spike"] };
    expect(terminalFilterLabels(filters, "fr").map((item) => item.label)).toEqual(["Haussière", "Sous pression", "Pic de volume"]);
    expect(terminalFilterLabels(filters, "en").map((item) => item.label)).toEqual(["Bullish", "Under pressure", "Volume spike"]);
  });
});
