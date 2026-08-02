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
const PUBLIC_ACTIONS = new Set(["register", "login"]);
const ALLOWED_ACTIONS = new Set([
  "register",
  "login",
  "logout",
  "logout-all",
  "me",
  "workspace",
  "profile",
  "change-password",
  "export",
  "delete",
]);

type Context = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

function noStoreHeaders(contentType = "application/json; charset=utf-8"): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });
}

function clearSession(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function proxy(request: NextRequest, context: Context): Promise<NextResponse> {
  const params = await context.params;
  const segments = params.path ?? [];
  if (segments.length !== 1 || !ALLOWED_ACTIONS.has(segments[0])) {
    return NextResponse.json({ detail: "Route de compte invalide." }, { status: 404 });
  }

  const action = segments[0];
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!PUBLIC_ACTIONS.has(action) && !token) {
    return NextResponse.json({ detail: "Connexion requise." }, { status: 401 });
  }

  const headers = new Headers({ Accept: "application/json" });
  const requestId = request.headers.get("X-Request-ID");
  if (requestId) headers.set("X-Request-ID", requestId);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body: ArrayBuffer | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.arrayBuffer();
    if (body.byteLength) headers.set("Content-Type", request.headers.get("content-type") ?? "application/json");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const upstream = await fetch(`${API_URL}/api/v1/account/${action}`, {
      method: request.method,
      headers,
      body: body?.byteLength ? body : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    const raw = await upstream.arrayBuffer();

    if (PUBLIC_ACTIONS.has(action) && upstream.ok) {
      const payload = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
      const sessionToken = typeof payload.token === "string" ? payload.token : null;
      const expiresAt = typeof payload.expires_at === "string" ? new Date(payload.expires_at) : null;
      delete payload.token;
      delete payload.token_type;
      const response = NextResponse.json(payload, { status: upstream.status, headers: noStoreHeaders() });
      if (sessionToken) {
        response.cookies.set(COOKIE_NAME, sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          expires: expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : undefined,
        });
      }
      return response;
    }

    const response = upstream.status === 204
      ? new NextResponse(null, {
          status: 204,
          headers: noStoreHeaders(contentType),
        })
      : new NextResponse(raw, {
          status: upstream.status,
          headers: noStoreHeaders(contentType),
        });
    const upstreamRequestId = upstream.headers.get("X-Request-ID");
    if (upstreamRequestId) response.headers.set("X-Request-ID", upstreamRequestId);
    if (action === "logout" || action === "logout-all" || action === "delete" || upstream.status === 401) {
      clearSession(response);
    }
    return response;
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "Délai dépassé lors de la connexion au compte Anatole."
      : "Le service de compte Anatole est temporairement indisponible.";
    return NextResponse.json({ detail }, { status: 502, headers: noStoreHeaders() });
  } finally {
    clearTimeout(timer);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;

