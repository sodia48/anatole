import type { AssistantResponse, PortfolioPositionInput } from "./types";

export type AssistantSurface = "stock" | "etf" | "portfolio" | "market" | "news" | "canada360" | "fixed_income" | "compare" | "other";
export type AssistantContext = {
  surface: AssistantSurface;
  route: string;
  symbol?: string;
  symbols: string[];
  instrument_type: "stock" | "etf" | "index" | "unknown";
  portfolio_scope: { authorized: boolean; position_count: number };
  language: "fr" | "en";
  metadata: Record<string, string>;
};
export type AssistantAction = { label: string; href: string; kind: "navigate" };
export type AssistantPortfolioPosition = {
  symbol: string; name: string; market_value: number; weight_percent: number;
  unrealized_pnl: number; unrealized_pnl_percent: number | null;
  base_currency: string; freshness: string;
};
export type PortfolioCoverage = { symbols_expected: number; symbols_available: number; coverage_percent: number };
export type PortfolioXRay = {
  position_count: number; quote_coverage_percent: number; effective_positions: number | null;
  top_three_percent: number | null; sector_coverage_percent: number | null;
  history_coverage_percent: number | null; risk_contribution_coverage_percent: number | null;
  attribution_coverage_percent: number | null; analysis_quality: "élevée" | "partielle" | "limitée";
};
export type PortfolioRiskContribution = {
  symbol: string; portfolio_weight_percent: number; standalone_volatility_percent: number;
  component_risk: number; risk_contribution_percent: number; observations: number;
};
export type PortfolioScenario = {
  factor: "tsx" | "wti" | "cad_usd" | "canada_10y"; shock: number;
  shock_unit: "percent" | "basis_points"; estimated_portfolio_change_percent: number | null;
  coverage: PortfolioCoverage; positions: { symbol: string; contribution_percent_points: number }[];
};
export type AssistantEvidence = {
  skill: string;
  sources: { label: string; type: string; freshness: string; timestamp: string | null; url: string | null }[];
  missing_data: string[];
  limitations: string[];
  position_rows?: AssistantPortfolioPosition[];
  portfolio_focus?: string | null;
  portfolio_xray?: PortfolioXRay | null;
  risk_contributions?: { items: PortfolioRiskContribution[]; coverage: PortfolioCoverage; observations: number } | null;
  lookthrough?: { holdings_coverage_percent: number; status: "observed" | "partial" | "unavailable";
    holdings: { symbol: string; direct_weight_percent: number; indirect_observed_weight_percent: number;
      combined_observed_weight_percent: number; source_etfs: string[] }[] } | null;
  concentration_map?: { direct_top_three_percent: number | null; top_cluster_weight_percent: number | null;
    sector_weights: Record<string, number>; currency_weights: Record<string, number>;
    factor_exposures: Record<string, number>; coverage: Record<string, number> } | null;
  attribution?: { horizon: string; portfolio_return_percent: number | null;
    benchmark_return_percent: number | null; excess_return_percent: number | null;
    coverage: PortfolioCoverage; methodology: "observed_day" | "current_positions_reconstructed" }[];
  correlation_clusters?: { label: string; symbols: string[]; combined_weight_percent: number;
    average_internal_correlation: number; coverage_percent: number }[];
  scenarios?: PortfolioScenario[];
  macro_exposures?: { factor: string; weighted_sensitivity: number | null;
    coverage_percent: number; source_freshness: string; context_only: boolean }[];
  watchtower?: { previous_available: boolean; previous_at: string | null; current_at: string;
    elapsed_seconds: number | null; changes: Record<string, number> } | null;
};
export type UnifiedAssistantResponse = AssistantResponse & {
  context: AssistantContext;
  conversation_id: string;
  actions: AssistantAction[];
  evidence: AssistantEvidence[];
  permission_required: boolean;
};
export type UnifiedAssistantRequest = {
  message: string;
  context: AssistantContext;
  conversation_id?: string;
  portfolio_consent?: boolean;
  portfolio_positions?: PortfolioPositionInput[];
};

const SYMBOL = /^[A-Z^][A-Z0-9.^-]{0,14}$/;

export function deriveAssistantContext(pathname: string, search: URLSearchParams, language: "fr" | "en"): AssistantContext {
  const route = pathname.replace(/\/$/, "") || "/";
  const focus = /^\/focus\/([A-Za-z0-9.^-]{1,15})$/.exec(route);
  const etf = /^\/etf\/([A-Za-z0-9.^-]{1,15})$/.exec(route);
  const symbol = (focus?.[1] ?? etf?.[1])?.toUpperCase().replace(/\.TO$/, "");
  const symbols = route === "/comparateur"
    ? (search.get("symbols") ?? "").split(",").map((value) => value.toUpperCase().replace(/\.TO$/, "")).filter((value) => SYMBOL.test(value)).slice(0, 5)
    : symbol && SYMBOL.test(symbol) ? [symbol] : [];
  const surface: AssistantSurface = focus ? "stock" : etf ? "etf" : route === "/portefeuille" ? "portfolio"
    : route === "/comparateur" ? "compare" : route === "/actualites" ? "news" : route === "/canada" ? "canada360" : route === "/taux-obligations" ? "fixed_income"
    : route === "/terminal" || route === "/screener" ? "market" : "other";
  return { surface, route, symbol: symbols[0], symbols,
    instrument_type: focus ? "stock" : etf ? "etf" : "unknown",
    portfolio_scope: { authorized: false, position_count: 0 }, language, metadata: {} };
}

export function assistantContextLabel(context: AssistantContext): string {
  if (context.surface === "stock") return `Focus · ${context.symbol ?? "Titre"}`;
  if (context.surface === "etf") return `ETF · ${context.symbol ?? "Fonds"}`;
  if (context.surface === "portfolio") return "Mon portefeuille";
  if (context.surface === "compare") return `Comparateur${context.symbols.length ? ` · ${context.symbols.join(" / ")}` : ""}`;
  if (context.surface === "canada360") return "Canada 360";
  if (context.surface === "fixed_income") return "Taux & Obligations";
  if (context.surface === "market") return "Marché";
  if (context.surface === "news") return "Actualités";
  return "Anatole";
}

export function readAssistantPortfolio(): PortfolioPositionInput[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem("anatole:portfolio:v1") ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 30).filter((row): row is PortfolioPositionInput => {
      if (!row || typeof row !== "object") return false;
      const item = row as Record<string, unknown>;
      return typeof item.symbol === "string" && SYMBOL.test(item.symbol.toUpperCase().replace(/\.TO$/, ""))
        && typeof item.quantity === "number" && item.quantity > 0 && item.quantity <= 1_000_000_000
        && typeof item.average_cost === "number" && item.average_cost >= 0 && item.average_cost <= 10_000_000;
    });
  } catch { return []; }
}
