import type { InsiderSnapshot, InsiderTrade, IpoItem } from "@/src/lib/api/types";
import { dedupeInsiderTradesForRender, filterIpoItems, formatIpoPrice, insiderCoverageUnavailable, insiderPreviewScanLimit } from "./model";

function ipo(overrides: Partial<IpoItem>): IpoItem {
  return {
    id: "ipo-1", event_date: null, company: "Example", symbol: "EX", symbols: ["EX"], exchange: "TSX", country: "Canada", event_type: "Nouvelle inscription", status: "À venir", instrument_type: "company", instrument_label: "Société", source_name: "TSX", source_url: "https://example.com", official: true, confidence_score: 100, focus_available: true,
    offer_price: null, offer_price_low: null, offer_price_high: null, offer_currency: "CAD", offer_price_status: "not_published", offer_price_label: "Prix non publié", price_source_url: null, ...overrides,
  };
}

const emptyInsiders: InsiderSnapshot = {
  trades: [], summary: { transactions: 0, companies: 0, buys: 0, sells: 0, grants_and_exercises: 0, buy_value: 0, sell_value: 0, net_value: 0, buy_ratio_percent: 0, unusual_transactions: 0 },
  sources: [{ source: "Finnhub", status: "unavailable", count: 0, detail: "offline", url: "https://example.com" }], market: "Canada", requested_ticker: null, scanned_symbols: 0, generated_at: "2026-08-31T12:00:00Z", refresh_after_seconds: 900, message: "offline",
};

function trade(id: string, shares: number): InsiderTrade {
  return { id, ticker: "RY", company: "Royal Bank", market: "Canada", insider_name: "Jane Doe", role: "Director", transaction_type: "buy", transaction_label: "Achat", transaction_code: "P", trade_date: "2026-08-20", filing_date: "2026-08-21", shares, price: 200, value: shares * 200, holdings_after: 5000, ownership: "Direct", unusual: false, source_name: "Test", source_url: "https://example.com", official_verification_url: "https://example.com/official", official_source: false };
}

describe("IPO and insider mobile model", () => {
  it("filters IPOs by search, country and instrument", () => {
    const rows = [ipo({}), ipo({ id: "ipo-2", symbol: "USX", company: "US ETF", country: "États-Unis", instrument_type: "etf" })];
    expect(filterIpoItems(rows, "example", "Canada", "company")).toHaveLength(1);
    expect(filterIpoItems(rows, "USX", "États-Unis", "etf")[0]?.symbol).toBe("USX");
  });

  it("renders final, range, reference and unpublished IPO prices without fabrication", () => {
    expect(formatIpoPrice(ipo({ offer_price: 12, offer_price_status: "final" }), "fr")).toContain("12,00");
    expect(formatIpoPrice(ipo({ offer_price_low: 10, offer_price_high: 14, offer_price_status: "range" }), "fr")).toContain("–");
    expect(formatIpoPrice(ipo({ offer_price: 11, offer_price_status: "reference" }), "fr")).toContain("≈");
    expect(formatIpoPrice(ipo({ offer_price_status: "not_published" }), "fr")).toBe("Non publié");
  });

  it("enforces preview limits independently from filters and distinguishes unavailable coverage from zero", () => {
    expect(insiderPreviewScanLimit("canada", "")).toBe(8);
    expect(insiderPreviewScanLimit("us", "")).toBe(10);
    expect(insiderPreviewScanLimit("canada", "RY")).toBe(1);
    expect(insiderCoverageUnavailable(emptyInsiders, false)).toBe(true);
    expect(insiderCoverageUnavailable({ ...emptyInsiders, sources: [{ ...emptyInsiders.sources[0]!, status: "available" }] }, false)).toBe(false);
  });

  it("deduplicates identical insider IDs for render while preserving order and distinct transactions", () => {
    const result = dedupeInsiderTradesForRender([trade("same", 100), trade("same", 250), trade("distinct", 500)]);
    expect(result.map((item) => item.id)).toEqual(["same", "distinct"]);
    expect(result[0]?.shares).toBe(100);
  });
});
