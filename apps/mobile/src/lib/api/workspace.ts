import { apiRequest } from "./base";
import type { AlertRule, AlertSnapshot, AssistantResponse, PortfolioPositionInput, PortfolioSnapshot } from "./types";

export const workspaceApi = {
  portfolio: (positions: PortfolioPositionInput[], signal?: AbortSignal, fast = false) => apiRequest<PortfolioSnapshot>(`/api/v1/workspace/portfolio${fast ? "?fast=true" : ""}`, { method: "POST", body: JSON.stringify({ positions, base_currency: "CAD" }), timeoutMs: fast ? 8_000 : 15_000, signal }),
  assistant: (message: string, portfolio: PortfolioPositionInput[], contextSymbol?: string, signal?: AbortSignal) => apiRequest<AssistantResponse>("/api/v1/workspace/assistant", { method: "POST", body: JSON.stringify({ message, context_symbol: contextSymbol, portfolio_positions: portfolio }), timeoutMs: 30_000, signal }),
  alerts: (rules: AlertRule[], signal?: AbortSignal) => apiRequest<AlertSnapshot>("/api/v1/workspace/alerts/evaluate", { method: "POST", body: JSON.stringify({ rules }), timeoutMs: 10_000, signal }),
};
