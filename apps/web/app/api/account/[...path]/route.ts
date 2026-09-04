import { NextRequest, NextResponse } from "next/server";

import {
  expiredSessionCookie,
  sessionCookie,
  SESSION_COOKIE_NAME,
} from "@/lib/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");

const PUBLIC_ROUTES = new Set(["registration", "register", "login", "mobile-session"]);
const ROUTES = new Map<string, ReadonlySet<string>>([
  ["registration", new Set(["GET"])],
  ["register", new Set(["POST"])],
  ["login", new Set(["POST"])],
  ["mobile-session", new Set(["POST"])],
  ["me", new Set(["GET"])],
  ["logout", new Set(["POST"])],
  ["logout-all", new Set(["POST"])],
  ["workspace", new Set(["GET", "PUT"])],
  ["profile", new Set(["PUT"])],
  ["change-password", new Set(["POST"])],
  ["export", new Set(["GET"])],
  ["delete", new Set(["DELETE"])],
]);

type Context = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

type UpstreamSession = {
  token?: unknown;
  token_type?: unknown;
  expires_at?: unknown;
  [key: string]: unknown;
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

function clearSession(response: NextResponse): void {
  response.cookies.set(expiredSessionCookie());
}

function setSession(
  response: NextResponse,
  token: string,
  expiresAt: string,
): boolean {
  const expires = new Date(expiresAt);
  if (!Number.isFinite(expires.getTime())) return false;

  response.cookies.set(sessionCookie(token, expires));
  return true;
}

function copyRequestId(upstream: Response, response: NextResponse): void {
  const requestId = upstream.headers.get("X-Request-ID");
  if (requestId) response.headers.set("X-Request-ID", requestId);
}

async function proxy(
  request: NextRequest,
  context: Context,
): Promise<NextResponse> {
  const params = await context.params;
  const segments = params.path ?? [];
  const route = segments.length === 1 ? segments[0] : "";
  const allowedMethods = ROUTES.get(route);

  if (!allowedMethods) {
    return NextResponse.json(
      { detail: "Route de compte invalide." },
      { status: 404, headers: noStoreHeaders() },
    );
  }
  if (!allowedMethods.has(request.method)) {
    const response = NextResponse.json(
      { detail: "Méthode non autorisée pour cette route de compte." },
      { status: 405, headers: noStoreHeaders() },
    );
    response.headers.set("Allow", [...allowedMethods].join(", "));
    return response;
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (route === "mobile-session") {
    const authorization = request.headers.get("authorization") ?? "";
    const mobileToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!mobileToken) return NextResponse.json({ detail: "Jeton mobile requis." }, { status: 401, headers: noStoreHeaders() });
    try {
      const upstream = await fetch(`${API_URL}/api/v1/account/me`, { headers: { Accept: "application/json", Authorization: `Bearer ${mobileToken}` }, cache: "no-store" });
      if (!upstream.ok) return NextResponse.json({ detail: "Session mobile invalide." }, { status: 401, headers: noStoreHeaders() });
      const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
      response.cookies.set(sessionCookie(mobileToken, new Date(Date.now() + 12 * 60 * 60 * 1000)));
      copyRequestId(upstream, response);
      return response;
    } catch {
      return NextResponse.json({ detail: "Validation de session mobile indisponible." }, { status: 502, headers: noStoreHeaders() });
    }
  }
  if (!PUBLIC_ROUTES.has(route) && !token) {
    return NextResponse.json(
      { detail: "Connexion requise." },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  const headers = new Headers({ Accept: "application/json" });
  if (token && !PUBLIC_ROUTES.has(route)) {
    headers.set("Authorization", `Bearer ${token}`);
  }
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

  const upstreamUrl = new URL(`${API_URL}/api/v1/account/${route}`);
  request.nextUrl.searchParams.forEach((value: string, key: string) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const clearsSession = new Set(["logout", "logout-all", "delete"]).has(route);

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

    if (upstream.ok && (route === "register" || route === "login")) {
      let session: UpstreamSession;
      try {
        session = JSON.parse(new TextDecoder().decode(raw)) as UpstreamSession;
      } catch {
        return NextResponse.json(
          { detail: "Réponse de session invalide." },
          { status: 502, headers: noStoreHeaders() },
        );
      }

      if (
        typeof session.token !== "string" ||
        typeof session.expires_at !== "string"
      ) {
        return NextResponse.json(
          { detail: "Réponse de session incomplète." },
          { status: 502, headers: noStoreHeaders() },
        );
      }

      const sessionToken = session.token;
      const clientSession = { ...session };
      delete clientSession.token;
      delete clientSession.token_type;
      const response = NextResponse.json(clientSession, {
        status: upstream.status,
        headers: noStoreHeaders(),
      });
      if (!setSession(response, sessionToken, session.expires_at)) {
        return NextResponse.json(
          { detail: "Expiration de session invalide." },
          { status: 502, headers: noStoreHeaders() },
        );
      }
      copyRequestId(upstream, response);
      return response;
    }

    const response =
      upstream.status === 204
        ? new NextResponse(null, {
            status: 204,
            headers: noStoreHeaders(contentType),
          })
        : new NextResponse(raw, {
            status: upstream.status,
            headers: noStoreHeaders(contentType),
          });
    copyRequestId(upstream, response);
    if ((clearsSession && upstream.ok) || upstream.status === 401) {
      clearSession(response);
    }
    return response;
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? "Délai dépassé lors de la communication avec le service de compte."
        : "Le service de compte est temporairement indisponible.";
    const response = NextResponse.json(
      { detail },
      { status: 502, headers: noStoreHeaders() },
    );
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
