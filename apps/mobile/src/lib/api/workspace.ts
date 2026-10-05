import { apiRequest } from "./base";
import type { AlertRule, AlertSnapshot, AssistantResponse, PortfolioPositionInput, PortfolioSnapshot } from "./types";

export type MobileAssistantContext = {
  surface: "stock" | "etf" | "portfolio" | "market" | "news" | "canada360" | "compare" | "other";
  route: string;
  symbol?: string;
  symbols: string[];
  instrument_type: "stock" | "etf" | "index" | "unknown";
  portfolio_scope: { authorized: boolean; position_count: number };
  language: "fr" | "en";
};
export type MobileUnifiedAssistantResponse = AssistantResponse & {
  conversation_id: string;
  permission_required: boolean;
  actions: { label: string; href: string; kind: "navigate" }[];
};

export const workspaceApi = {
  portfolio: (positions: PortfolioPositionInput[], signal?: AbortSignal, fast = false) => apiRequest<PortfolioSnapshot>(`/api/v1/workspace/portfolio${fast ? "?fast=true" : ""}`, { method: "POST", body: JSON.stringify({ positions, base_currency: "CAD" }), timeoutMs: fast ? 8_000 : 25_000, signal }),
  assistant: (message: string, portfolio: PortfolioPositionInput[], contextSymbol?: string, signal?: AbortSignal) => apiRequest<AssistantResponse>("/api/v1/workspace/assistant", { method: "POST", body: JSON.stringify({ message, context_symbol: contextSymbol, portfolio_positions: portfolio }), timeoutMs: 30_000, signal }),
  assistantUnified: (message: string, context: MobileAssistantContext, conversationId?: string, portfolioConsent = false, positions: PortfolioPositionInput[] = [], signal?: AbortSignal) =>
    apiRequest<MobileUnifiedAssistantResponse>("/api/v1/assistant/chat", { method: "POST", body: JSON.stringify({ message, context, conversation_id: conversationId, portfolio_consent: portfolioConsent, portfolio_positions: positions }), timeoutMs: 45_000, signal }),
  alerts: (rules: AlertRule[], signal?: AbortSignal) => apiRequest<AlertSnapshot>("/api/v1/workspace/alerts/evaluate", { method: "POST", body: JSON.stringify({ rules }), timeoutMs: 10_000, signal }),
};
