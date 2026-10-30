import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { OptionsScreen } from "./OptionsScreen";
import { OPTION_FILTERS_STORAGE_KEY } from "./optionFilters";
import { optionsApi } from "@/src/lib/api/options";
import { workspaceApi } from "@/src/lib/api/workspace";
import { router } from "expo-router";

let mockChainError: Error | null = null;
let mockAccountId: string | null = null;
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ pick: (fr: string) => fr }) }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/providers/MobileAccountProvider", () => ({ useMobileAccount: () => ({
  state: mockAccountId ? "authenticated" : "anonymous", user: mockAccountId ? { id: mockAccountId } : null,
}) }));
jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const market = queryKey[1];
    const universe = queryKey[0] === "options-universe";
    return {
      isLoading: false, isRefetching: false, error: universe ? null : mockChainError, refetch: jest.fn(),
      data: universe ? { items: [] } : {
        market, symbol: market === "commodities" ? "GC" : "RY", name: "Fixture", generated_at: "2026-10-27T12:00:00Z",
        stale: market === "commodities", source_statuses: [], analytics: { contract_count: 3 }, expirations: ["2027-11-25"],
        contracts: market === "commodities" ? [{ symbol: "fixture", underlying: "GC", market: "commodities", contract: "GCZ27", side: "call", strike: 2.5,
          expiration: null, bid: null, ask: null, last: 0, volume: null, open_interest: 0,
          implied_volatility: null },
        { symbol: "fixture-c", underlying: "GC", market: "commodities", contract: "GCZ27", side: "call", strike: 3,
          expiration: "2027-11-25", bid: 1, ask: 2, last: 1.5, volume: 10, open_interest: 5, implied_volatility: null },
        { symbol: "fixture-p", underlying: "GC", market: "commodities", contract: "GCZ27", side: "put", strike: 3,
          expiration: "2027-11-25", bid: 1, ask: 2, last: 1.5, volume: 10, open_interest: 5, implied_volatility: null }] : [
        { symbol: "RY-C", underlying: "RY", market: "tsx", contract: null, side: "call", strike: 100,
          expiration: "2027-11-25", source: "Synthetic", bid: 1, ask: 2, last: 1.5, volume: 10, open_interest: 5, implied_volatility: null },
        { symbol: "RY-P", underlying: "RY", market: "tsx", contract: null, side: "put", strike: 100,
          expiration: "2027-11-25", source: "Synthetic", bid: 1, ask: 2, last: 1.5, volume: 10, open_interest: 5, implied_volatility: null }],
      },
    };
  },
}));

beforeEach(async () => { mockChainError = null; mockAccountId = null; await AsyncStorage.clear(); });

test("commodity snapshots identify stale and unknown data without hiding published zero", async () => {
  const view = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(view.getByText("Matières")); });
  expect(view.getByText(/instantané périmé/)).toBeTruthy();
  expect(view.getByText(/fraîcheur des cotations à confirmer/)).toBeTruthy();
  expect(view.getByText("Vol N/D · OI 0")).toBeTruthy();
  expect(view.getByText("N/D · GCZ27")).toBeTruthy();
  await act(async () => { fireEvent.press(view.getByLabelText("CALL 2.50 N/D fixture")); });
  expect(view.getByText("fixture · CALL")).toBeTruthy();
  await act(async () => { fireEvent.press(view.getByText("2027-11-25")); });
  expect(view.queryByLabelText("CALL 2.50 N/D fixture")).toBeNull();
  expect(view.getByLabelText("CALL 3.00 2027-11-25 fixture-c")).toBeTruthy();
  expect(view.getByLabelText("PUT 3.00 2027-11-25 fixture-p")).toBeTruthy();
  await view.unmount();
});

test("mobile filters retain preferences across screen remount and exclude missing volume", async () => {
  const view = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(view.getByText("Matières")); });
  await waitFor(() => expect(view.getByLabelText("Filtres avancés").props.accessibilityState?.disabled).not.toBe(true));
  await act(async () => { fireEvent.press(view.getByLabelText("Filtres avancés")); });
  await act(async () => { fireEvent.changeText(view.getByLabelText("Volume minimum"), "0"); });
  expect(view.queryByLabelText("CALL 2.50 N/D fixture")).toBeNull();
  expect(view.getByLabelText("CALL 3.00 2027-11-25 fixture-c")).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(OPTION_FILTERS_STORAGE_KEY)) ?? "{}").volume).toBe("0"));
  await view.unmount();
  const reopened = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(reopened.getByText("Matières")); });
  await waitFor(() => expect(reopened.queryByLabelText("CALL 2.50 N/D fixture")).toBeNull());
  await act(async () => { fireEvent.press(reopened.getByLabelText("Filtres avancés")); });
  expect(reopened.getByLabelText("Volume minimum").props.value).toBe("0");
  await reopened.unmount();
});

test("a failed refresh warns when cached chain data remains available", async () => {
  mockChainError = new Error("upstream error");
  const view = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(view.getByText("Matières")); });
  expect(view.getByText("Actualisation impossible : les données affichées peuvent être périmées.")).toBeTruthy();
  expect(view.queryByText("upstream error")).toBeNull();
  await view.unmount();
});

test("native strategy builder validates specifications and compares two hypothetical scenarios", async () => {
  const payoff = jest.spyOn(optionsApi, "payoff").mockResolvedValue({ currency: "CAD", theoretical_debit: "500",
    minimum_profit_loss: "-500", maximum_profit_loss: null, loss_unbounded: false, gain_unbounded: true,
    break_evens: [{ lower: "95", upper: "95" }, { lower: "105", upper: "105" }], points: [
      { price: "80", profit_loss: "1500" }, { price: "100", profit_loss: "-500" }, { price: "120", profit_loss: "1500" }] });
  const view = await render(<OptionsScreen />);
  await fireEvent.press(view.getByLabelText("CALL 100.00 2027-11-25 RY-C"));
  await fireEvent.press(view.getByLabelText("Ajouter au constructeur"));
  await fireEvent.press(view.getByLabelText("PUT 100.00 2027-11-25 RY-P"));
  await fireEvent.press(view.getByLabelText("Ajouter au constructeur"));
  await fireEvent.press(view.getByLabelText("Long straddle"));
  await fireEvent.press(view.getByLabelText("Simuler à l'échéance"));
  expect(payoff).not.toHaveBeenCalled();
  expect(view.getByText(/Vérifiez les jambes/)).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText("Prime hypothétique jambe 1"), "3");
  await fireEvent.changeText(view.getByLabelText("Prime hypothétique jambe 2"), "2");
  await fireEvent.changeText(view.getByLabelText("Multiplicateur vérifié jambe 1"), "100");
  await fireEvent.changeText(view.getByLabelText("Multiplicateur vérifié jambe 2"), "100");
  await fireEvent.changeText(view.getByLabelText("Devise vérifiée (ex. CAD)"), "CAD");
  await fireEvent.changeText(view.getByLabelText("Échéance et fuseau vérifiés"), "2027-11-25T16:00:00-05:00");
  await fireEvent.changeText(view.getByLabelText("Prix minimal du sous-jacent"), "80");
  await fireEvent.changeText(view.getByLabelText("Prix maximal du sous-jacent"), "120");
  await fireEvent.press(view.getByLabelText("Prime initiale jambe 1 : non confirmée"));
  await fireEvent.press(view.getByLabelText("Prime initiale jambe 2 : non confirmée"));
  await fireEvent.press(view.getByLabelText("Simuler à l'échéance"));
  await waitFor(() => expect(payoff).toHaveBeenCalledTimes(1));
  expect(payoff.mock.calls[0]?.[0].legs).toEqual(expect.arrayContaining([
    expect.objectContaining({ symbol: "RY-C", side: "call", premium: "3", multiplier: "100", direction: "long" }),
    expect.objectContaining({ symbol: "RY-P", side: "put", premium: "2", multiplier: "100", direction: "long" }),
  ]));
  expect(view.getByText("Scénario théorique 1")).toBeTruthy();
  expect(view.getByText(/Seuils de rentabilité: 95, 105/)).toBeTruthy();
  expect(view.getByLabelText(/Résultats théoriques dans la plage de 80 à 120/)).toBeTruthy();
  payoff.mockResolvedValueOnce({ currency: "CAD", theoretical_debit: "-100", minimum_profit_loss: "-19900",
    maximum_profit_loss: null, loss_unbounded: false, gain_unbounded: true,
    break_evens: [{ lower: "99.5", upper: "99.5" }], points: [
      { price: "80", profit_loss: "-3900" }, { price: "100", profit_loss: "100" }, { price: "130", profit_loss: "3100" }] });
  await fireEvent.press(view.getByLabelText("Jambe 2 : achat, modifier"));
  expect(view.getByLabelText("Jambe 2 : vente, modifier")).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText("Quantité jambe 2"), "2");
  await fireEvent.changeText(view.getByLabelText("Prix maximal du sous-jacent"), "130");
  await fireEvent.press(view.getByLabelText("Simuler à l'échéance"));
  await waitFor(() => expect(payoff).toHaveBeenCalledTimes(2));
  expect(view.getByText("Scénario théorique 2")).toBeTruthy();
  expect(view.getByLabelText(/Résultats théoriques dans la plage de 80 à 130/)).toBeTruthy();
  expect(payoff.mock.calls[1]?.[0].prices.at(-1)).toBe("130.000000");
  expect(payoff.mock.calls[1]?.[0].legs[1]).toEqual(expect.objectContaining({ direction: "short", quantity: 2 }));
  expect(view.getByText(/Seuils de rentabilité: 99.5/)).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Retirer jambe 1"));
  expect(view.queryByText(/1. RY-C/)).toBeNull();
  payoff.mockRestore();
  await view.unmount();
});

test("native assistant stays in Options, sends no positions and adds chain context only explicitly", async () => {
  const response = { intent: "options_education", title: "Options", answer: "Un call donne un droit d'achat.",
    facts: [], links: [], sources: [], suggestions: [], confidence: "limitée", disclaimer: "Données synthétiques",
    guardrail_triggered: false, generated_at: "2026-10-30T00:00:00Z", conversation_id: "conversation",
    permission_required: false, actions: [], synthesis_provider: null };
  const ask = jest.spyOn(workspaceApi, "assistantUnified").mockResolvedValue(response);
  const view = await render(<OptionsScreen />);
  await fireEvent.press(view.getByLabelText("Ouvrir l'assistant Options"));
  await fireEvent.changeText(view.getByLabelText("Votre question Options"), "Explique un call");
  await fireEvent.press(view.getByLabelText("Interroger Anatole"));
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  expect(view.getByText("Un call donne un droit d'achat.")).toBeTruthy();
  expect(ask.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ surface: "options", route: "/options", metadata: {}, symbols: [] }));
  expect(ask.mock.calls[0]?.[3]).toBe(false);
  expect(ask.mock.calls[0]?.[4]).toEqual([]);

  ask.mockResolvedValueOnce({ ...response, answer: "Chaîne RY synthétique : cache périmé.",
    sources: [{ label: "Synthetic", detail: "", status: "fallback" }] });
  await fireEvent.press(view.getByLabelText("Ajouter la chaîne RY au contexte"));
  await fireEvent.changeText(view.getByLabelText("Votre question Options"), "Analyse la chaîne RY");
  await fireEvent.press(view.getByLabelText("Interroger Anatole"));
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
  expect(ask.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ symbol: "RY", metadata: { options_market: "tsx", options_expiration: "" } }));
  expect(ask.mock.calls[1]?.[3]).toBe(false);
  expect(ask.mock.calls[1]?.[4]).toEqual([]);
  expect(view.getByText("Chaîne RY synthétique : cache périmé.")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Retirer le contexte de chaîne"));
  await fireEvent.press(view.getByLabelText("Ajouter la chaîne RY au contexte"));
  await fireEvent.press(view.getByText("Matières"));
  await fireEvent.press(view.getByText("Canada · MX"));
  expect(view.getByLabelText("Ajouter la chaîne RY au contexte")).toBeTruthy();
  ask.mockResolvedValueOnce({ ...response, permission_required: true });
  await fireEvent.changeText(view.getByLabelText("Votre question Options"), "Analyse mon portefeuille");
  await fireEvent.press(view.getByLabelText("Interroger Anatole"));
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(3));
  expect(ask.mock.calls[2]?.[1].metadata).toEqual({});
  expect(ask.mock.calls[2]?.[4]).toEqual([]);
  expect(view.getByText(/positions ne sont pas transmises/)).toBeTruthy();
  ask.mockResolvedValueOnce({ ...response, answer: "Vous devriez acheter cette option." });
  await fireEvent.changeText(view.getByLabelText("Votre question Options"), "Analyse cette option");
  await fireEvent.press(view.getByLabelText("Interroger Anatole"));
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(4));
  expect(view.queryByText("Vous devriez acheter cette option.")).toBeNull();
  expect(view.getByText(/ne satisfait pas les garde-fous/)).toBeTruthy();
  ask.mockResolvedValueOnce({ ...response, answer: "Analyse non sourcée.", synthesis_provider: "external" });
  await fireEvent.press(view.getByLabelText("Interroger Anatole"));
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(5));
  expect(view.queryByText("Analyse non sourcée.")).toBeNull();
  expect(view.getByText(/ne satisfait pas les garde-fous/)).toBeTruthy();
  ask.mockRestore();
  await view.unmount();
});

test("native account reminders use verified expiry without sending position or premium", async () => {
  mockAccountId = "00000000-0000-0000-0000-000000000001";
  const reminder = { position_id: "00000000-0000-0000-0000-000000000002", underlying: "RY",
    expires_at: "2027-11-25T21:00:00+00:00", reminder_days: 7, triggered_at: null };
  const create = jest.spyOn(optionsApi, "createReminder").mockResolvedValue({ position_id: reminder.position_id });
  const list = jest.spyOn(optionsApi, "reminders").mockResolvedValue([reminder]);
  const remove = jest.spyOn(optionsApi, "deleteReminder").mockResolvedValue();
  const view = await render(<OptionsScreen />);
  await fireEvent.press(view.getByLabelText("CALL 100.00 2027-11-25 RY-C"));
  await fireEvent.press(view.getByLabelText("Enregistrer le rappel du compte"));
  expect(create).not.toHaveBeenCalled();
  expect(view.getByText(/vérifiez l'échéance future/)).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText("Échéance du rappel avec fuseau"), "2027-11-25T16:00:00-05:00");
  await fireEvent.press(view.getByLabelText("PUT 100.00 2027-11-25 RY-P"));
  expect(view.getByLabelText("Échéance du rappel avec fuseau").props.value).toBe("");
  await fireEvent.press(view.getByLabelText("CALL 100.00 2027-11-25 RY-C"));
  await fireEvent.press(view.getByLabelText("Enregistrer le rappel du compte"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]?.[0]).toEqual({ expected_account_id: mockAccountId, underlying: "RY",
    expires_at: "2027-11-25T16:00:00-05:00", reminder_days: 7 });
  expect(list).toHaveBeenCalledWith(mockAccountId);
  expect(view.getByText("Rappel enregistré sur le compte.")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Ouvrir Notifications"));
  expect(router.push).toHaveBeenCalledWith("/notifications");
  await fireEvent.press(view.getByLabelText("Supprimer rappel RY 2027-11-25T21:00:00+00:00"));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(reminder.position_id, mockAccountId));
  expect(view.getByText("Aucun rappel enregistré.")).toBeTruthy();
  create.mockRestore(); list.mockRestore(); remove.mockRestore();
  await view.unmount();
});

test("a late reminder response is not shown after switching accounts", async () => {
  mockAccountId = "00000000-0000-0000-0000-000000000001";
  let resolveList!: (value: Awaited<ReturnType<typeof optionsApi.reminders>>) => void;
  const list = jest.spyOn(optionsApi, "reminders").mockImplementation(() => new Promise((resolve) => { resolveList = resolve; }));
  const view = await render(<OptionsScreen />);
  await fireEvent.press(view.getByLabelText("Actualiser les rappels"));
  expect(list).toHaveBeenCalledWith(mockAccountId);
  mockAccountId = "00000000-0000-0000-0000-000000000002";
  await view.rerender(<OptionsScreen />);
  await act(async () => { resolveList([{ position_id: "old-account", underlying: "PRIVATE",
    expires_at: "2027-11-25T21:00:00+00:00", reminder_days: 7, triggered_at: null }]); });
  expect(view.queryByText(/PRIVATE/)).toBeNull();
  list.mockRestore();
  await view.unmount();
});
