import type { Href } from "expo-router";

import type { NewsItem, StockNewsItem } from "@/src/lib/api/types";

export type ArticleRouteParams = {
  url: string;
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  imageUrl: string;
  context: "macro" | "stock";
  category: string;
  region: string;
  ticker: string;
  relatedTickers: string;
};

type RouteValue = string | string[] | undefined;

function first(value: RouteValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function limited(value: string | null | undefined, maximum: number): string {
  return (value ?? "").trim().slice(0, maximum);
}

export function safeWebUrl(value: string | null | undefined): string | null {
  const raw = limited(value, 4_096);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function articleHref(item: NewsItem | StockNewsItem): Href | null {
  const url = safeWebUrl(item.url);
  if (!url) return null;
  const source = "source" in item ? item.source : item.publisher;
  const imageUrl = safeWebUrl(item.image_url) ?? "";
  return {
    pathname: "/article",
    params: {
      url,
      title: limited(item.title, 320),
      source: limited(source, 120),
      publishedAt: limited(item.published_at, 64),
      summary: limited(item.summary, 900),
      imageUrl,
      context: "publisher" in item ? "stock" : "macro",
      category: "category" in item ? limited(item.category, 80) : "stock",
      region: "regions" in item ? limited(item.regions[0], 20) : "CA",
      ticker: "related_tickers" in item ? limited(item.related_tickers[0]?.replace(/\.TO$/i, ""), 16) : "",
      relatedTickers: "related_tickers" in item ? limited(item.related_tickers.join(","), 120) : "",
    } satisfies ArticleRouteParams,
  } as Href;
}

export function parseArticleParams(params: Record<string, RouteValue>): ArticleRouteParams | null {
  const url = safeWebUrl(first(params.url));
  if (!url) return null;
  return {
    url,
    title: limited(first(params.title), 320),
    source: limited(first(params.source), 120),
    publishedAt: limited(first(params.publishedAt), 64),
    summary: limited(first(params.summary), 900),
    imageUrl: safeWebUrl(first(params.imageUrl)) ?? "",
    context: first(params.context) === "stock" ? "stock" : "macro",
    category: limited(first(params.category), 80),
    region: limited(first(params.region), 20),
    ticker: limited(first(params.ticker), 16),
    relatedTickers: limited(first(params.relatedTickers), 120),
  };
}

export function isExternalScheme(value: string): boolean {
  try {
    const scheme = new URL(value).protocol;
    return scheme === "tel:" || scheme === "mailto:";
  } catch {
    return false;
  }
}
