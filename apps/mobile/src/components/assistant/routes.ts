export type MobileAssistantHref = string | { pathname: string; params?: Record<string, string> };

export function mobileAssistantHref(href: string): MobileAssistantHref | null {
  const [path, query = ""] = href.trim().split("?", 2);
  const params = Object.fromEntries(new URLSearchParams(query).entries());
  if (path === "/comparateur" || path === "/compare") return { pathname: "/compare", params };
  if (path === "/portefeuille" || path === "/(tabs)/portfolio") return "/(tabs)/portfolio";
  if (path === "/alertes" || path === "/alerts") return { pathname: "/alerts", params };
  if (path?.startsWith("/focus/")) {
    const ticker = path.slice("/focus/".length).trim().toUpperCase();
    return ticker ? { pathname: "/focus/[ticker]", params: { ticker } } : null;
  }
  if (["/terminal", "/screener", "/assistant", "/discover", "/etf"].includes(path ?? "")) return path ?? null;
  return null;
}
