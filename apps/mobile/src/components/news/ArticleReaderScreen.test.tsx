import { act, cleanup, render, userEvent } from "@testing-library/react-native";
import { Linking, Share, StyleSheet } from "react-native";

import { ArticleReaderScreen } from "@/src/components/news/ArticleReaderScreen";
import type { NewsItem, StockNewsItem } from "@/src/lib/api/types";
import { articleHref } from "@/src/lib/article";
import { marketApi } from "@/src/lib/api/market";
import { originalPalette, setActiveMobileTheme, skyPalette } from "@/src/theme/palettes";

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { newsBrief: jest.fn() } }));

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
    jest.mocked(marketApi.newsBrief).mockClear();
    jest.mocked(marketApi.newsBrief).mockResolvedValue({
      summary: "L’emploi a progressé de 2,1 % selon le rapport officiel.",
      key_figures: [{ value: "2,1 %", context: "L’emploi a progressé de 2,1 %." }],
      changes: [], why_it_matters: "", watch: ["Le prochain rapport est attendu en octobre."],
      source_note: "Publication officielle consultée.", source_mode: "official_page",
      availability: "article", translation_status: "original", detail_available: true,
    });
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
    expect(await view.findByText("L’emploi a progressé de 2,1 % selon le rapport officiel.")).toBeTruthy();
    expect(marketApi.newsBrief).toHaveBeenCalledWith(expect.objectContaining({ context: "macro", language: "fr" }), expect.anything());
    await userEvent.setup().press(view.getByText("Analyse détaillée"));
    expect(view.getByText("Chiffres importants")).toBeTruthy();
    expect(view.getByText("À surveiller")).toBeTruthy();
    await view.unmount();
  }, 15_000);

  it("uses the same route contract for StockNewsItem", () => {
    const href = articleHref(stock) as { pathname: string; params: Record<string, string> };
    expect(href.pathname).toBe("/article");
    expect(href.params.source).toBe("Business Wire");
    expect(href.params.url).toBe(stock.url);
  });

  it("labels an unavailable brief as a source excerpt and retries", async () => {
    jest.mocked(marketApi.newsBrief).mockRejectedValueOnce(new Error("temporarily unavailable"));
    const view = await render(<ArticleReaderScreen />);
    expect(await view.findByText("Extrait de la source")).toBeTruthy();
    expect(view.getByText(economic.summary)).toBeTruthy();
    await userEvent.setup().press(view.getByTestId("article-brief-retry"));
    expect(await view.findByText("L’emploi a progressé de 2,1 % selon le rapport officiel.")).toBeTruthy();
    await view.unmount();
  }, 15_000);

  it("does not repeat a title-only article as an invented summary", async () => {
    jest.mocked(marketApi.newsBrief).mockResolvedValueOnce({
      summary: economic.title, key_figures: [], changes: [], why_it_matters: "", watch: [],
      source_note: "Seuls le titre et les métadonnées sont disponibles.",
      source_mode: "title_only", availability: "limited", detail_available: false,
    });
    const view = await render(<ArticleReaderScreen />);
    expect(await view.findByText("Seuls le titre et la source sont disponibles. Ouvrez l’article original pour en savoir plus.")).toBeTruthy();
    expect(view.queryByText("Informations limitées")).toBeNull();
    expect(view.queryByTestId("article-summary")).toBeNull();
    await view.unmount();
  });

  it("labels an untranslated English brief in a French interface", async () => {
    mockParams = paramsFrom(stock);
    jest.mocked(marketApi.newsBrief).mockResolvedValueOnce({
      summary: "The bank published its quarterly figures.", key_figures: [],
      changes: [], why_it_matters: "", watch: [],
      source_note: "Texte original conservé : traduction fiable indisponible.",
      source_mode: "feed_summary", availability: "publisher_excerpt",
      translation_status: "unavailable", detail_available: false,
    });
    const view = await render(<ArticleReaderScreen />);
    expect(await view.findByText("Résumé en langue originale")).toBeTruthy();
    expect(marketApi.newsBrief).toHaveBeenCalledWith(expect.objectContaining({ context: "stock", ticker: "RY" }), expect.anything());
    await view.unmount();
  });

  it("refuses an invalid article URL before creating a WebView", async () => {
    mockParams = { ...paramsFrom(economic), url: "javascript:alert(1)" };
    const view = await render(<ArticleReaderScreen />);
    expect(view.getByTestId("article-invalid-url")).toBeTruthy();
    expect(view.queryByTestId("article-webview")).toBeNull();
    await view.unmount();
  });

  it("shows a forecast series once and reveals its evidence on demand", async () => {
    jest.mocked(marketApi.newsBrief).mockResolvedValueOnce({
      summary: "Le marché devrait croître selon l'éditeur.", key_figures: [],
      figure_series: [{ label: "Taille prévue du marché", figures: [
        { value: "4,94 milliards USD", period: "2025", context: "Source: 2025 4,94 milliards USD." },
        { value: "5,26 milliards USD", period: "2026", context: "Source: 2026 5,26 milliards USD." },
      ] }], changes: [], why_it_matters: "", watch: [],
      source_note: "Seul l'extrait est disponible.", source_mode: "feed_summary",
      availability: "publisher_excerpt", detail_available: true,
    });
    const view = await render(<ArticleReaderScreen />);
    await view.findByText("Le marché devrait croître selon l'éditeur.");
    await userEvent.setup().press(view.getByText("Analyse détaillée"));
    expect(view.getByText("2025 · 4,94 milliards USD")).toBeTruthy();
    expect(view.getByText("2026 · 5,26 milliards USD")).toBeTruthy();
    expect(view.queryByText("Source: 2025 4,94 milliards USD.")).toBeNull();
    await userEvent.setup().press(view.getByText("Justification"));
    expect(view.getByText("Source: 2025 4,94 milliards USD.")).toBeTruthy();
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
