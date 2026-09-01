import type { PsychologyComponent, PsychologySnapshot } from "@/src/lib/api/types";

export function psychologyLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ "Peur extrême": "Extreme fear", Peur: "Fear", Neutre: "Neutral", Confiance: "Confidence", "Confiance extrême": "Extreme confidence" } as Record<string, string>)[value] ?? value;
}

export function psychologyComponentCopy(item: PsychologyComponent, data: PsychologySnapshot, language: "fr" | "en"): { label: string; description: string } {
  if (language === "fr") return item;
  const labels: Record<string, string> = { breadth: "Market breadth", momentum: "Index momentum", volatility: "Volatility", trend: "Trend", leadership: "Sector leadership" };
  const descriptions: Record<string, string> = {
    breadth: `${Math.round(data.advance_ratio)}% of TSX 60 securities are advancing.`,
    momentum: `20-session change: ${data.change_20d >= 0 ? "+" : ""}${data.change_20d.toFixed(2)}%; 50-session change: ${data.change_50d >= 0 ? "+" : ""}${data.change_50d.toFixed(2)}%.`,
    volatility: `Annualized volatility over 20 sessions: ${data.volatility_20d.toFixed(1)}%.`,
    trend: "Technical reading of the S&P/TSX Composite trend.",
    leadership: "Share of sectors currently advancing.",
  };
  return { label: labels[item.key] ?? item.label, description: descriptions[item.key] ?? item.description };
}
