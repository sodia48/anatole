import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");
const COOKIE_NAME = "anatole_session";

type Context = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

function noStoreHeaders(
  contentType = "application/json; charset=utf-8",
): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });
}

function allowed(segments: string[], method: string): boolean {
  const path = segments.join("/");
  if (path === "overview") return method === "GET";
  if (path === "users") return method === "GET";
  if (path === "invites") return method === "GET" || method === "POST";
  if (/^invites\/[a-zA-Z0-9_-]+\/revoke$/.test(path)) return method === "POST";
  if (path === "reports") return method === "GET";
  if (/^reports\/[a-zA-Z0-9_-]+$/.test(path)) return method === "PATCH";
  return false;
}

async function proxy(
  request: NextRequest,
  context: Context,
): Promise<NextResponse> {
  const params = await context.params;
  const segments = params.path ?? [];
  if (!allowed(segments, request.method)) {
    return NextResponse.json(
      { detail: "Route administrateur invalide." },
      { status: 404, headers: noStoreHeaders() },
    );
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { detail: "Connexion administrateur requise." },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  });
  const requestId = request.headers.get("X-Request-ID");
  if (requestId) headers.set("X-Request-ID", requestId);

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

  const upstreamUrl = new URL(
    `${API_URL}/api/v1/admin/${segments.join("/")}`,
  );
  request.nextUrl.searchParams.forEach((value: string, key: string) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: body?.byteLength ? body : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    const contentType =
      upstream.headers.get("content-type") ??
      "application/json; charset=utf-8";
    const raw = await upstream.arrayBuffer();
    const response = upstream.status === 204
      ? new NextResponse(null, { status: 204, headers: noStoreHeaders(contentType) })
      : new NextResponse(raw, { status: upstream.status, headers: noStoreHeaders(contentType) });
    const upstreamRequestId = upstream.headers.get("X-Request-ID");
    if (upstreamRequestId) response.headers.set("X-Request-ID", upstreamRequestId);
    if (upstream.status === 401) {
      response.cookies.set({
        name: COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(0),
        maxAge: 0,
      });
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error && error.name === "AbortError"
          ? "Délai dépassé lors de la communication avec l’administration."
          : "Le service d’administration est temporairement indisponible.",
      },
      { status: 502, headers: noStoreHeaders() },
    );
  } finally {
    clearTimeout(timer);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
