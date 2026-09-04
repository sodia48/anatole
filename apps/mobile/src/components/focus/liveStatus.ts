export type LiveQuoteState = "connecting" | "live" | "offline";

export function compactSessionVolume(value: number | null | undefined, language: "fr" | "en"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  const units = language === "fr"
    ? [[1e12, " T"], [1e9, " G"], [1e6, " M"], [1e3, " k"]] as const
    : [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const;
  const absolute = Math.abs(value);
  const unit = units.find(([threshold]) => absolute >= threshold);
  if (!unit) return Math.round(value).toLocaleString(language === "fr" ? "fr-CA" : "en-CA");
  const [threshold, suffix] = unit;
  const scaled = value / threshold;
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  const compact = scaled.toFixed(digits).replace(/\.?0+$/, "");
  return `${language === "fr" ? compact.replace(".", ",") : compact}${suffix}`;
}

export function liveQuoteStatus(state: LiveQuoteState, delayed: boolean, pick: (fr: string, en: string) => string): string {
  if (state === "live" && !delayed) return "LIVE";
  if (state === "live") return pick("CONNECTÉ · DIFFÉRÉ", "CONNECTED · DELAYED");
  if (state === "connecting") return pick("CONNEXION…", "CONNECTING…");
  return pick("HORS LIGNE", "OFFLINE");
}
