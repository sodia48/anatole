import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Language = "fr" | "en";

const OFFICIAL_RESOURCES = {
  fr: {
    news: "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-fra.atom",
    calendar: "https://www150.statcan.gc.ca/n1/dai-quo/cal2-fra.htm",
  },
  en: {
    news: "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom",
    calendar: "https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm",
  },
} as const;

type ResourceName =
  keyof typeof OFFICIAL_RESOURCES.fr;

function normalizeLanguage(
  value: string | null,
): Language {
  return value === "en" ? "en" : "fr";
}

function isResourceName(value: string | null): value is ResourceName {
  return value === "news" || value === "calendar";
}

export async function GET(request: NextRequest) {
  const resource =
    request.nextUrl.searchParams.get(
      "resource",
    );
  const language =
    normalizeLanguage(
      request.nextUrl.searchParams.get(
        "lang",
      ),
    );

  if (!isResourceName(resource)) {
    return NextResponse.json(
      { detail: "resource doit être 'news' ou 'calendar'" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35_000);

  try {
    const upstream = await fetch(OFFICIAL_RESOURCES[language][resource], {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/150.0 Safari/537.36 Anatole/0.6",
        Accept:
          resource === "news"
            ? "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.1"
            : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "Accept-Language":
          language === "fr"
            ? "fr-CA,fr;q=1.0,en-CA;q=0.5,en;q=0.4"
            : "en-CA,en;q=1.0,fr-CA;q=0.5,fr;q=0.4",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          detail: `Statistique Canada a retourné HTTP ${upstream.status}`,
          resource,
        },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      );
    }

    const body = await upstream.arrayBuffer();
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ??
        (resource === "news"
          ? "application/atom+xml; charset=utf-8"
          : "text/html; charset=utf-8"),
    );
    headers.set("Cache-Control", "s-maxage=900, stale-while-revalidate=86400");
    headers.set("X-Anatole-Relay", "statcan-official");
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? "Délai dépassé lors de la connexion à Statistique Canada"
        : "Impossible de joindre Statistique Canada";

    console.error("statcan_relay_error", {
      resource,
      language,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ detail, resource }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
