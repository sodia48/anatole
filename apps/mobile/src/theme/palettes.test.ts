import { createThemedStyles, originalPalette, setActiveMobileTheme, skyPalette } from "./palettes";

describe("Anatole mobile palettes", () => {
  afterEach(() => setActiveMobileTheme("dark"));

  it("keeps the exact Anatole Original identity", () => {
    expect(originalPalette).toMatchObject({
      background: "#050D15", surface: "#081B29", surfaceRaised: "#0C2435",
      border: "#17445F", borderStrong: "#256A91", text: "#EDF8FF",
      textMuted: "#8FB1C6", textSubtle: "#5F849B", primary: "#2C9CFF",
      primaryPressed: "#1777C5", cyan: "#21D4D2", positive: "#00D7AD",
      negative: "#FF365F", warning: "#F6B94A", onPrimary: "#FFFFFF",
    });
  });

  it("exposes the exact light Anatole Sky identity", () => {
    expect(skyPalette).toMatchObject({
      background: "#DDF3FF", surface: "#F7FCFF", surfaceRaised: "#EAF6FD",
      border: "#B7DAEC", borderStrong: "#7FB9D8", text: "#082033",
      textMuted: "#56758A", textSubtle: "#7897AA", primary: "#168FE0",
      primaryPressed: "#0E73BA", cyan: "#0D9FAF", positive: "#008F73",
      negative: "#CC3150", warning: "#A96900", onPrimary: "#FFFFFF",
    });
  });

  it("resolves styles again immediately when the active theme changes", () => {
    const styles = createThemedStyles((colors) => ({ card: { backgroundColor: colors.surface, color: colors.text } }));
    setActiveMobileTheme("dark");
    expect(styles.card).toEqual(expect.objectContaining({ backgroundColor: "#081B29", color: "#EDF8FF" }));
    setActiveMobileTheme("blue");
    expect(styles.card).toEqual(expect.objectContaining({ backgroundColor: "#F7FCFF", color: "#082033" }));
    setActiveMobileTheme("dark");
    expect(styles.card).toEqual(expect.objectContaining({ backgroundColor: "#081B29", color: "#EDF8FF" }));
  });

  it("always uses white text on primary actions", () => {
    expect(originalPalette.onPrimary).toBe("#FFFFFF");
    expect(skyPalette.onPrimary).toBe("#FFFFFF");
  });
});
