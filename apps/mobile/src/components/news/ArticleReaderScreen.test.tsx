import { act, cleanup, render, userEvent } from "@testing-library/react-native";
import { Linking, Share, StyleSheet } from "react-native";

import { ArticleReaderScreen } from "@/src/components/news/ArticleReaderScreen";
import type { NewsItem, StockNewsItem } from "@/src/lib/api/types";
import { articleHref } from "@/src/lib/article";
import { originalPalette, setActiveMobileTheme, skyPalette } from "@/src/theme/palettes";

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

const economic: NewsItem = {
  id: "economic",
  title: "L’emploi progresse au Canada",
  summary: "Le rapport officiel présente les dernières données disponibles.",
  url: "https://publisher.example.com/economy",
  source: "Statistique Canada",
  category: "Travail",
  published_at: "2026-09-05T13:00:00Z",
  sentiment: "Positif",
  sentiment_score: 18,
  regions: ["CA"],
  image_url: "https://images.example.com/economy.jpg",
};

const stock: StockNewsItem = {
  id: "stock",
  title: "Royal Bank reports results",
  summary: "The bank published its quarterly figures.",
  url: "https://publisher.example.com/royal-bank",
  publisher: "Business Wire",
  published_at: "2026-09-05T12:00:00Z",
  related_tickers: ["RY.TO"],
  image_url: null,
};

function paramsFrom(item: NewsItem | StockNewsItem): Record<string, string> {
  const href = articleHref(item) as { params: Record<string, string> };
  return href.params;
}

describe("Anatole article reader", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockParams = paramsFrom(economic);
  });

  afterEach(() => {
    setActiveMobileTheme("dark");
    cleanup();
    jest.restoreAllMocks();
  });

  it("loads a NewsItem publisher URL inside the isolated WebView", async () => {
    const view = await render(<ArticleReaderScreen />);
    expect(view.getByText("L’emploi progresse au Canada")).toBeTruthy();
    expect(view.getByText("Résumé")).toBeTruthy();
    expect(view.getByText("Source originale")).toBeTruthy();
    expect(view.getByTestId("article-hero-image")).toBeTruthy();
    expect(view.getByTestId("article-webview").props.source).toEqual({ uri: economic.url });
    await view.unmount();
  });

  it("uses the same route contract for StockNewsItem", () => {
    const href = articleHref(stock) as { pathname: string; params: Record<string, string> };
    expect(href.pathname).toBe("/article");
    expect(href.params.source).toBe("Business Wire");
    expect(href.params.url).toBe(stock.url);
  });

  it("refuses an invalid article URL before creating a WebView", async () => {
    mockParams = { ...paramsFrom(economic), url: "javascript:alert(1)" };
    const view = await render(<ArticleReaderScreen />);
    expect(view.getByTestId("article-invalid-url")).toBeTruthy();
    expect(view.queryByTestId("article-webview")).toBeNull();
    await view.unmount();
  });

  it("keeps article metadata and offers the external browser after a WebView error", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await render(<ArticleReaderScreen />);
    await act(async () => view.getByTestId("article-webview").props.onError());
    expect(view.getByText("L’emploi progresse au Canada")).toBeTruthy();
    expect(view.getByTestId("article-webview-error")).toBeTruthy();
    await userEvent.setup().press(view.getByTestId("article-open-browser"));
    expect(open).toHaveBeenCalledWith(economic.url);
    await view.unmount();
  });

  it("supports native back and share actions", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
    const view = await render(<ArticleReaderScreen />);
    const user = userEvent.setup();
    await user.press(view.getByTestId("article-back"));
    await user.press(view.getByTestId("article-share"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(economic.url) }));
    await view.unmount();
  });

  it("uses opaque, high-contrast reader surfaces in both themes", async () => {
    setActiveMobileTheme("dark");
    const dark = await render(<ArticleReaderScreen />);
    expect(StyleSheet.flatten(dark.getByTestId("article-story").props.style).backgroundColor).toBe(originalPalette.background);
    expect(StyleSheet.flatten(dark.getByTestId("article-summary").props.style).backgroundColor).toBe(originalPalette.surfaceRaised);
    await dark.unmount();

    setActiveMobileTheme("blue");
    const light = await render(<ArticleReaderScreen />);
    expect(StyleSheet.flatten(light.getByTestId("article-story").props.style).backgroundColor).toBe(skyPalette.background);
    expect(StyleSheet.flatten(light.getByTestId("article-summary").props.style).backgroundColor).toBe(skyPalette.surfaceRaised);
    await light.unmount();
  });

  it("keeps the original source as an explicit secondary action", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await render(<ArticleReaderScreen />);
    const user = userEvent.setup();
    await user.press(view.getByTestId("article-view-original"));
    expect(open).toHaveBeenCalledWith(economic.url);
    expect(view.getByTestId("article-webview")).toBeTruthy();
    await view.unmount();
  });

  it("only permits web URLs in the WebView and hands off tel links", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await render(<ArticleReaderScreen />);
    const guard = view.getByTestId("article-webview").props.onShouldStartLoadWithRequest as (request: { url: string }) => boolean;
    expect(guard({ url: "https://publisher.example.com/next" })).toBe(true);
    expect(guard({ url: "javascript:alert(1)" })).toBe(false);
    expect(guard({ url: "tel:+14165550123" })).toBe(false);
    expect(open).toHaveBeenCalledWith("tel:+14165550123");
    await view.unmount();
  });
});
