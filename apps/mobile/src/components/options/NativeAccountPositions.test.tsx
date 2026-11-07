import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { ApiError } from "@/src/lib/api/base";
import { optionsApi, type AccountOptionPosition, type AccountOptionPositions, type OptionContract } from "@/src/lib/api/options";

import { NativeAccountPositions } from "./NativeAccountPositions";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ pick: (fr: string) => fr }) }));

const accountA = "00000000-0000-0000-0000-000000000001";
const accountB = "00000000-0000-0000-0000-000000000002";
const selected: OptionContract = {
  symbol: "RY-C", underlying: "RY", market: "tsx", contract: null, side: "call", strike: 100,
  expiration: "2027-11-25", exchange: "TSX", bid: 1, ask: 2, last: 1.5, change: null,
  percent_change: null, volume: 10, open_interest: 5, implied_volatility: null, delta: null,
  gamma: null, theta: null, vega: null, in_the_money: null, source: "Synthetic", delayed: true,
};
const empty: AccountOptionPositions = { revision: 4, positions: [] };
const position: AccountOptionPosition = {
  id: "position-1", symbol: selected.symbol, underlying: selected.underlying, market: selected.market,
  contract: selected.contract, side: selected.side, strike: selected.strike, expiration: "2027-11-25",
  expiry_at: "2027-11-25T16:00:00-05:00", direction: "long", quantity: 2, multiplier: 100,
  premium: 3.5, currency: "CAD", reminder_days: 7,
};

afterEach(() => jest.restoreAllMocks());

async function fillPosition(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.changeText(view.getByLabelText("Quantité de contrats"), "2");
  await fireEvent.changeText(view.getByLabelText("Multiplicateur de position"), "100,5");
  await fireEvent.changeText(view.getByLabelText("Prime initiale par unité"), "3,5");
  await fireEvent.changeText(view.getByLabelText("Devise de la position"), "cad");
  await fireEvent.changeText(view.getByLabelText("Échéance de la position avec fuseau"), "2027-11-25T16:00:00-05:00");
}

test("opens only the signed-in account's positions on request", async () => {
  const read = jest.spyOn(optionsApi, "accountPositions").mockResolvedValue({ revision: 4, positions: [position] });
  const view = await render(<NativeAccountPositions accountId={accountA} selected={null} />);

  expect(read).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText("Ouvrir les positions du compte"));
  await waitFor(() => expect(read).toHaveBeenCalledWith(accountA, expect.any(AbortSignal)));
  expect(view.getByText("RY-C · CALL 100 · 2027-11-25")).toBeTruthy();
  expect(view.getByText("Achat · 2 × 100 · CAD · prime saisie 3.5")).toBeTruthy();

  await view.rerender(<NativeAccountPositions key="signed-out" accountId={null} selected={null} />);
  expect(view.getByText("Connectez-vous pour gérer les positions du compte.")).toBeTruthy();
  expect(view.queryByText("RY-C · CALL 100 · 2027-11-25")).toBeNull();
  expect(view.queryByLabelText("Ouvrir les positions du compte")).toBeNull();
});

test("creates a position only after explicit confirmation with the account revision", async () => {
  jest.spyOn(optionsApi, "accountPositions").mockResolvedValue(empty);
  const create = jest.spyOn(optionsApi, "createAccountPosition").mockResolvedValue({ revision: 5, positions: [position] });
  const view = await render(<NativeAccountPositions accountId={accountA} selected={selected} />);
  await fireEvent.press(view.getByLabelText("Ouvrir les positions du compte"));
  await waitFor(() => expect(view.getByLabelText("Enregistrer la position du compte")).toBeTruthy());
  await fillPosition(view);

  await fireEvent.press(view.getByLabelText("Enregistrer la position du compte"));
  expect(create).not.toHaveBeenCalled();
  expect(view.getByText(/Vérifiez la date avec fuseau/)).toBeTruthy();

  await fireEvent.press(view.getByLabelText("Confirmer spécifications et prime initiale"));
  await fireEvent.press(view.getByLabelText("Enregistrer la position du compte"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledWith({
    expected_account_id: accountA, expected_revision: 4,
    position: {
      symbol: "RY-C", underlying: "RY", market: "tsx", contract: null, side: "call", strike: 100,
      expiration: "2027-11-25", expiry_at: "2027-11-25T16:00:00-05:00", direction: "long",
      quantity: 2, multiplier: 100.5, premium: 3.5, currency: "CAD", reminder_days: 7,
    },
  }, expect.any(AbortSignal));
  await waitFor(() => expect(view.getByText("Position enregistrée dans le compte.")).toBeTruthy());
  expect(view.getByLabelText("Confirmer spécifications et prime initiale")).toBeTruthy();
  expect(view.getByLabelText("Retirer position RY-C position-1")).toBeTruthy();
});

test("requires renewed confirmation when the upfront premium changes", async () => {
  jest.spyOn(optionsApi, "accountPositions").mockResolvedValue(empty);
  const create = jest.spyOn(optionsApi, "createAccountPosition").mockResolvedValue({ revision: 5, positions: [position] });
  const view = await render(<NativeAccountPositions accountId={accountA} selected={selected} />);
  await fireEvent.press(view.getByLabelText("Ouvrir les positions du compte"));
  await waitFor(() => expect(view.getByLabelText("Enregistrer la position du compte")).toBeTruthy());
  await fillPosition(view);
  await fireEvent.press(view.getByLabelText("Confirmer spécifications et prime initiale"));
  expect(view.getByLabelText("Spécifications confirmées")).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText("Prime initiale par unité"), "4,5");
  expect(view.getByLabelText("Confirmer spécifications et prime initiale")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Enregistrer la position du compte"));
  expect(create).not.toHaveBeenCalled();

  await fireEvent.press(view.getByLabelText("Confirmer spécifications et prime initiale"));
  await fireEvent.press(view.getByLabelText("Enregistrer la position du compte"));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]?.[0].position.premium).toBe(4.5);
});

test("reports revision conflicts and keeps the loaded list for refresh", async () => {
  jest.spyOn(optionsApi, "accountPositions").mockResolvedValue(empty);
  const create = jest.spyOn(optionsApi, "createAccountPosition").mockRejectedValue(new ApiError("conflict", 409, null));
  const view = await render(<NativeAccountPositions accountId={accountA} selected={selected} />);
  await fireEvent.press(view.getByLabelText("Ouvrir les positions du compte"));
  await waitFor(() => expect(view.getByLabelText("Enregistrer la position du compte")).toBeTruthy());
  await fillPosition(view);
  await fireEvent.press(view.getByLabelText("Confirmer spécifications et prime initiale"));
  await fireEvent.press(view.getByLabelText("Enregistrer la position du compte"));

  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(view.getByText("Les données ont changé ailleurs. Actualisez.")).toBeTruthy();
  expect(view.getByText("Aucune position dans le compte.")).toBeTruthy();
  expect(view.getByLabelText("Actualiser les positions du compte")).toBeTruthy();
});

test("removes one position with the current revision and preserves other positions", async () => {
  const other = { ...position, id: "position-2", symbol: "RY-P", side: "put" as const };
  jest.spyOn(optionsApi, "accountPositions").mockResolvedValue({ revision: 8, positions: [position, other] });
  const save = jest.spyOn(optionsApi, "saveAccountPositions").mockResolvedValue({ revision: 9, positions: [other] });
  const view = await render(<NativeAccountPositions accountId={accountA} selected={null} />);
  await fireEvent.press(view.getByLabelText("Ouvrir les positions du compte"));
  await waitFor(() => expect(view.getByLabelText("Retirer position RY-C position-1")).toBeTruthy());
  await fireEvent.press(view.getByLabelText("Retirer position RY-C position-1"));

  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ expected_account_id: accountA, expected_revision: 8, positions: [other] }, expect.any(AbortSignal));
  await waitFor(() => expect(view.queryByLabelText("Retirer position RY-C position-1")).toBeNull());
  expect(view.getByLabelText("Retirer position RY-P position-2")).toBeTruthy();
  expect(view.getByText("Position retirée du compte.")).toBeTruthy();
});

test("does not show a late response from a previous account after a keyed remount", async () => {
  let resolveA!: (value: AccountOptionPositions) => void;
  const read = jest.spyOn(optionsApi, "accountPositions").mockImplementation((accountId) =>
    accountId === accountA ? new Promise((resolve) => { resolveA = resolve; }) : Promise.resolve(empty));
  const view = await render(<NativeAccountPositions key={accountA} accountId={accountA} selected={null} />);
  await fireEvent.press(view.getByLabelText("Ouvrir les positions du compte"));
  expect(read).toHaveBeenCalledWith(accountA, expect.any(AbortSignal));

  await view.rerender(<NativeAccountPositions key={accountB} accountId={accountB} selected={null} />);
  await fireEvent.press(view.getByLabelText("Ouvrir les positions du compte"));
  await waitFor(() => expect(read).toHaveBeenCalledWith(accountB, expect.any(AbortSignal)));
  await act(async () => { resolveA({ revision: 1, positions: [{ ...position, symbol: "PRIVATE" }] }); });

  expect(view.queryByText(/PRIVATE/)).toBeNull();
  expect(view.getByText("Aucune position dans le compte.")).toBeTruthy();
});
