import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");

type Context = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

function publicCacheTtl(pathname: string): number {
  if (pathname === "/health" || pathname.includes("/reliability/status")) {
    return 0;
  }

  if (pathname.includes("/api/v1/market/cockpit")) return 10;
  if (pathname.includes("/api/v1/discovery/psychology")) return 30;
  if (pathname.includes("/api/v1/analysis/terminal")) return 45;
  if (pathname.includes("/api/v1/discovery/screener")) return 60;
  if (pathname.includes("/api/v1/stocks/")) return 60;
  if (pathname.includes("/api/v1/discovery/news")) return 120;
  if (pathname.includes("/api/v1/discovery/calendar")) return 300;
  if (pathname.includes("/api/v1/discovery/earnings-calendar")) return 300;
  if (pathname.includes("/api/v1/discovery/etfs")) return 300;
  if (pathname.includes("/api/v1/discovery/ipo")) return 300;
  if (pathname.includes("/api/v1/discovery/insiders")) return 120;
  if (pathname.includes("/api/v1/discovery/institutions")) return 600;

  return 0;
}

function responseHeaders(
  contentType: string,
  ttl: number,
): Headers {
  const headers = new Headers({
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });

  if (ttl > 0) {
    headers.set(
      "Cache-Control",
      `public, s-maxage=${ttl}, stale-while-revalidate=${Math.max(ttl * 6, 60)}`,
    );
  } else {
    headers.set("Cache-Control", "no-store, max-age=0");
  }

  return headers;
}

function validSegments(segments: string[]): boolean {
  return (
    segments.length > 0 &&
    segments.length <= 12 &&
    segments.every((segment) => /^[a-zA-Z0-9._~-]+$/.test(segment))
  );
}

async function proxy(
  request: NextRequest,
  context: Context,
): Promise<NextResponse> {
  const params = await context.params;
  const segments = params.path ?? [];

  if (!validSegments(segments)) {
    return NextResponse.json(
      { detail: "Route Anatole invalide." },
      { status: 404 },
    );
  }

  const upstreamUrl = new URL(
    `${API_URL}/${segments.map(encodeURIComponent).join("/")}`,
  );
  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const pathname = `/${segments.join("/")}`;
  const ttl = request.method === "GET" ? publicCacheTtl(pathname) : 0;
  const headers = new Headers({ Accept: "application/json" });

  const requestId = request.headers.get("X-Request-ID");
  if (requestId) headers.set("X-Request-ID", requestId);

  const clientVersion = request.headers.get("X-Anatole-Client-Version");
  if (clientVersion) headers.set("X-Anatole-Client-Version", clientVersion);

  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("Authorization", authorization);

  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    const requestBody = await request.arrayBuffer();
    if (requestBody.byteLength) {
      body = requestBody;
      headers.set(
        "Content-Type",
        request.headers.get("content-type") ?? "application/json",
      );
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: body?.byteLength ? body : undefined,
      signal: controller.signal,
      ...(ttl > 0
        ? { next: { revalidate: ttl } }
        : { cache: "no-store" as const }),
    });

    const contentType =
      upstream.headers.get("content-type") ??
      "application/json; charset=utf-8";
    const bodyless =
      request.method === "HEAD" ||
      upstream.status === 204 ||
      upstream.status === 205 ||
      upstream.status === 304;

    const response = bodyless
      ? new NextResponse(null, {
          status: upstream.status,
          headers: responseHeaders(contentType, ttl),
        })
      : new NextResponse(await upstream.arrayBuffer(), {
          status: upstream.status,
          headers: responseHeaders(contentType, ttl),
        });

    for (const name of [
      "X-Request-ID",
      "X-Anatole-Version",
      "X-Anatole-Stale",
      "X-Anatole-Origin-Status",
      "Server-Timing",
    ]) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }

    response.headers.set(
      "X-Anatole-Proxy-Cache",
      ttl > 0 ? `swr-${ttl}s` : "bypass",
    );
    return response;
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? "Délai dépassé lors de la récupération des données Anatole."
        : "Le service Anatole est temporairement indisponible.";

    return NextResponse.json(
      { detail },
      {
        status: 502,
        headers: responseHeaders("application/json; charset=utf-8", 0),
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
