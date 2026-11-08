import { fireEvent, render } from "@testing-library/react-native";

import type { OptionContract } from "@/src/lib/api/options";

import { NativeOptionScreener } from "./NativeOptionScreener";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ pick: (fr: string) => fr }) }));

const call: OptionContract = {
  symbol: "RY-C100", underlying: "RY", market: "tsx", contract: null, side: "call", strike: 100,
  expiration: "2027-11-25", exchange: "TSX", bid: 1, ask: 2, last: 1.5, change: null,
  percent_change: null, volume: 50, open_interest: 100, implied_volatility: null, delta: null,
  gamma: null, theta: null, vega: null, in_the_money: null, source: "Synthetic", delayed: true,
};
const put: OptionContract = { ...call, symbol: "RY-P100", side: "put", volume: null, open_interest: null };

test("screens observed contracts and adds the selected one to the builder", async () => {
  const add = jest.fn();
  const view = await render(<NativeOptionScreener contracts={[call, put]} stale canAdd onAdd={add} />);
  expect(view.queryByText("RY-C100 · CALL 100 · 2027-11-25")).toBeNull();

  await fireEvent.press(view.getByLabelText("Ouvrir le screener"));
  expect(view.getByText(/instantané périmé/)).toBeTruthy();
  expect(view.getByText("RY-C100 · CALL 100 · 2027-11-25")).toBeTruthy();
  expect(view.getByText("RY-P100 · PUT 100 · 2027-11-25")).toBeTruthy();
  expect(view.getAllByText("OI N/D")).toHaveLength(1);

  await fireEvent.changeText(view.getByLabelText("Volume minimum du screener"), "1");
  expect(view.queryByText("RY-P100 · PUT 100 · 2027-11-25")).toBeNull();
  await fireEvent.press(view.getByLabelText("Ajouter au constructeur RY-C100 CALL 100"));
  expect(add).toHaveBeenCalledWith(call);
  await view.unmount();
});
