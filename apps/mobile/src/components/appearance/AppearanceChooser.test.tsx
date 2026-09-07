import { fireEvent, render } from "@testing-library/react-native";

import { LocaleProvider } from "@/src/lib/i18n";
import { setActiveMobileTheme } from "@/src/theme/palettes";
import { AppearanceChooser } from "./AppearanceChooser";

describe("AppearanceChooser", () => {
  afterEach(() => setActiveMobileTheme("dark"));

  it("shows two labelled radio cards with an explicit selected state", async () => {
    const onSelect = jest.fn();
    const view = await render(<LocaleProvider><AppearanceChooser selected="dark" onSelect={onSelect} /></LocaleProvider>);
    expect(view.getByText("Choisis ton Anatole")).toBeTruthy();
    expect(view.getByLabelText("Anatole Original").props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(view.getByLabelText("Anatole Ciel").props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    fireEvent.press(view.getByLabelText("Anatole Ciel"));
    expect(onSelect).toHaveBeenCalledWith("blue");
  });

  it("renders real cockpit previews for Original and Sky", async () => {
    const view = await render(<LocaleProvider><AppearanceChooser selected="blue" onSelect={jest.fn()} /></LocaleProvider>);
    expect(view.getByLabelText("Anatole Ciel").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(view.toJSON()).toBeTruthy();
  });
});
