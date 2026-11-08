import { fireEvent, render } from "@testing-library/react-native";

import type { OptionChainSnapshot, OptionContract } from "@/src/lib/api/options";
import { NativeVolatilityIntelligence } from "./NativeVolatilityIntelligence";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ pick: (fr: string) => fr }) }));

function contract(side: "call" | "put", strike: number, iv: number | null, delta: number | null,
  changes: Partial<OptionContract> = {}): OptionContract {
  return {
    symbol: `SYNTH-${side}-${strike}`, underlying: "RY", market: "tsx", contract: null,
    side, strike, expiration: "2027-11-25", exchange: "TSX", bid: null, ask: null, last: null,
    change: null, percent_change: null, volume: null, open_interest: null,
    implied_volatility: iv, delta, gamma: null, theta: null, vega: null, in_the_money: null,
    source: "Synthetic fixture", delayed: false, ...changes,
  };
}

function snapshot(contracts: OptionContract[], changes: Partial<OptionChainSnapshot> = {}): OptionChainSnapshot {
  return {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic fixture", category: "equity",
    exchange: "TSX", underlying_price: 100, requested_expiration: null, expirations: ["2027-11-25"],
    contracts, analytics: { contract_count: contracts.length, call_count: 0, put_count: 0,
      call_volume: null, put_volume: null, call_open_interest: null, put_open_interest: null,
      put_call_volume_ratio: null, put_call_open_interest_ratio: null, atm_implied_volatility: null,
      max_pain_estimate: null }, source_statuses: [], generated_at: "2026-10-27T12:00:00Z",
    refresh_after_seconds: 60, stale: false, ...changes,
  };
}

test("shows only identifiable loaded IV points and a supported 25-delta skew", async () => {
  const chain = snapshot([
    contract("put", 90, 30, -0.25), contract("call", 110, 20, 0.25),
    contract("call", 100, 24, 0.5), contract("put", 100, 25, -0.5),
    contract("call", 120, null, null), contract("put", 80, 0, null),
  ]);
  const view = await render(<NativeVolatilityIntelligence chain={chain} expiry="" />);
  await fireEvent.press(view.getByLabelText("Voir la volatilité"));

  expect(view.getByLabelText(/Smile IV : 4 contrats identifiables ; 4 points affichés/)).toBeTruthy();
  expect(view.getByText(/10.00 points de pourcentage/)).toBeTruthy();
  expect(view.getByText(/l'origine de l'IV par contrat n'est pas disponible/)).toBeTruthy();
  expect(view.getByText(/Cette heure ne garantit pas la fraîcheur des cotations/)).toBeTruthy();
  expect(view.queryByText(/cotations différées/)).toBeNull();
});

test("does not invent a smile from missing or ambiguous values and flags stale commodity data", async () => {
  const commodity = { market: "commodities" as const, underlying: "GC", contract: "GCZ27" };
  const chain = snapshot([
    contract("call", 100, null, 0.25, commodity),
    contract("put", 90, 0, -0.25, commodity),
    contract("call", 110, 20, 0.25, commodity),
    contract("call", 110, 21, 0.26, { ...commodity, symbol: "SECOND-DELIVERABLE" }),
  ], { market: "commodities", symbol: "GC", provider_symbol: "GC", underlying_price: 100,
    stale: true });
  const view = await render(<NativeVolatilityIntelligence chain={chain} expiry="" refreshFailed />);
  await fireEvent.press(view.getByLabelText("Voir la volatilité"));

  expect(view.getByText("Aucune série de volatilité exploitable pour la chaîne et l'échéance affichées.")).toBeTruthy();
  expect(view.getByText("Instantané périmé ou actualisation impossible.")).toBeTruthy();
  expect(view.getByText("Fraîcheur des cotations de matières premières à confirmer.")).toBeTruthy();
  expect(view.queryByLabelText(/Smile IV/)).toBeNull();
});

test("keeps futures months and expiries separate when switching series", async () => {
  const first = { market: "commodities" as const, underlying: "GC", contract: "GCZ27",
    expiration: "2027-11-25" };
  const second = { market: "commodities" as const, underlying: "GC", contract: "GCG28",
    expiration: "2028-02-24", delayed: true };
  const chain = snapshot([
    contract("put", 90, 31, -0.25, first), contract("call", 110, 20, 0.25, first),
    contract("put", 90, 30, -0.25, second), contract("call", 110, 26, 0.25, second),
  ], { market: "commodities", symbol: "GC", provider_symbol: "GC", expirations: [first.expiration, second.expiration] });
  const view = await render(<NativeVolatilityIntelligence chain={chain} expiry="" />);
  await fireEvent.press(view.getByLabelText("Voir la volatilité"));

  expect(view.getByText(/GCZ27 · 1\/2/)).toBeTruthy();
  expect(view.getByText(/11.00 points de pourcentage/)).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Série suivante"));
  expect(view.getByText(/GCG28 · 2\/2/)).toBeTruthy();
  expect(view.getByText(/4.00 points de pourcentage/)).toBeTruthy();
  expect(view.getByText("Cette série comprend des cotations différées.")).toBeTruthy();

  await view.rerender(<NativeVolatilityIntelligence chain={chain} expiry={first.expiration} />);
  expect(view.getByText(/GCZ27 · 1\/1/)).toBeTruthy();
  expect(view.queryByLabelText("Série suivante")).toBeNull();
  expect(view.queryByText("Cette série comprend des cotations différées.")).toBeNull();
});

test("bounds the mobile chart while disclosing the full loaded count", async () => {
  const chain = snapshot(Array.from({ length: 100 }, (_, index) =>
    contract("call", 50 + index, 20 + index / 10, null)));
  const view = await render(<NativeVolatilityIntelligence chain={chain} expiry="" />);
  await fireEvent.press(view.getByLabelText("Voir la volatilité"));

  expect(view.getByLabelText(/100 contrats identifiables ; 80 points affichés/)).toBeTruthy();
  expect(view.getByText("80 points affichés sur 100 ; échantillonnage des contrats identifiables.")).toBeTruthy();
  expect(view.getByText("N/D : points ±0,25 delta absents, trop éloignés ou ambigus.")).toBeTruthy();
});
