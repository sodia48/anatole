import { apiRequest } from "./base";
import type { AlertRule, AlertSnapshot, PortfolioPositionInput, PortfolioSnapshot } from "./types";

export const workspaceApi = {
  portfolio: (positions: PortfolioPositionInput[]) => apiRequest<PortfolioSnapshot>("/api/v1/workspace/portfolio", { method: "POST", body: JSON.stringify({ positions, base_currency: "CAD" }), timeoutMs: 60_000 }),
  alerts: (rules: AlertRule[]) => apiRequest<AlertSnapshot>("/api/v1/workspace/alerts/evaluate", { method: "POST", body: JSON.stringify({ rules }), timeoutMs: 45_000 }),
};
