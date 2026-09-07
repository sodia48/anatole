import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { MobileThemeProvider, useMobileTheme } from "./MobileThemeProvider";

const mockSaveWorkspace = jest.fn(async () => undefined);
let mockTheme: "dark" | "blue" = "blue";

jest.mock("./MobileAccountProvider", () => ({
  useMobileAccount: () => ({
    workspace: { revision: 1, updated_at: null, data: { preferences: { theme: mockTheme } } },
    saveWorkspace: mockSaveWorkspace,
  }),
}));

function Probe() {
  const current = useMobileTheme();
  return <Pressable testID="theme-probe" onPress={() => void current.setTheme(current.theme === "blue" ? "dark" : "blue")}><Text>{current.theme}:{current.colors.background}:{current.colors.onPrimary}</Text></Pressable>;
}

describe("MobileThemeProvider", () => {
  beforeEach(() => { mockSaveWorkspace.mockClear(); mockTheme = "blue"; });

  it("reads workspace.preferences.theme and saves the same dark|blue contract", async () => {
    const view = await render(<MobileThemeProvider><Probe /></MobileThemeProvider>);
    expect(screen.getByText("blue:#DDF3FF:#FFFFFF")).toBeTruthy();
    fireEvent.press(view.getByTestId("theme-probe"));
    await waitFor(() => expect(mockSaveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ preferences: expect.objectContaining({ theme: "dark" }) })));
  });

  it("switches from dark to blue without a reload", async () => {
    mockTheme = "dark";
    const view = await render(<MobileThemeProvider><Probe /></MobileThemeProvider>);
    fireEvent.press(view.getByTestId("theme-probe"));
    await waitFor(() => expect(mockSaveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ preferences: expect.objectContaining({ theme: "blue" }) })));
  });
});
