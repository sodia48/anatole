import {
  NextRequest,
  NextResponse,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UPSTREAM_API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");

const RETRYABLE_STATUS = new Set([
  429,
  502,
  503,
  504,
]);

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 45_000;

type RouteContext = {
  params:
    | Promise<{
        path: string[];
      }>
    | {
        path: string[];
      };
};

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function validPath(segments: string[]): boolean {
  if (!segments.length) {
    return false;
  }

  return segments.every((segment) => {
    const decoded = decodeURIComponent(segment);

    return Boolean(
      decoded &&
        decoded !== "." &&
        decoded !== ".." &&
        !decoded.includes("\\") &&
        !decoded.includes("://"),
    );
  });
}

function responseHeaders(
  upstream: Response,
): Headers {
  const headers = new Headers();

  for (const name of [
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  headers.set(
    "Cache-Control",
    "no-store, max-age=0",
  );
  headers.set(
    "X-Anatole-Relay",
    "nextjs-same-origin",
  );
  headers.set(
    "X-Content-Type-Options",
    "nosniff",
  );

  return headers;
}

function failureResponse(
  detail: string,
  status = 502,
): NextResponse {
  return NextResponse.json(
    {
      detail,
      relay: "nextjs-same-origin",
    },
    {
      status,
      headers: {
        "Cache-Control":
          "no-store, max-age=0",
      },
    },
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const parameters = await context.params;
  const segments = parameters.path ?? [];

  if (!validPath(segments)) {
    return failureResponse(
      "Chemin API Anatole invalide.",
      400,
    );
  }

  const pathname = segments
    .map((segment) =>
      encodeURIComponent(
        decodeURIComponent(segment),
      ),
    )
    .join("/");

  const target = new URL(
    `${UPSTREAM_API_URL}/${pathname}`,
  );

  request.nextUrl.searchParams.forEach(
    (value, key) => {
      target.searchParams.append(key, value);
    },
  );

  let lastDetail =
    "Impossible de joindre Anatole API.";

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    const controller =
      new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS,
    );

    try {
      const upstream = await fetch(
        target,
        {
          method: "GET",
          headers: {
            Accept:
              request.headers.get("accept") ??
              "application/json",
            "User-Agent":
              "Anatole-Web-Relay/1.0",
          },
          cache: "no-store",
          redirect: "follow",
          signal: controller.signal,
        },
      );

      if (
        RETRYABLE_STATUS.has(
          upstream.status,
        ) &&
        attempt < MAX_ATTEMPTS
      ) {
        lastDetail =
          `Anatole API a retourné HTTP ${upstream.status}.`;
        await pause(450 * attempt);
        continue;
      }

      const body =
        await upstream.arrayBuffer();

      return new NextResponse(body, {
        status: upstream.status,
        headers:
          responseHeaders(upstream),
      });
    } catch (error) {
      lastDetail =
        error instanceof Error &&
        error.name === "AbortError"
          ? "Délai dépassé lors de la connexion à Anatole API."
          : "Connexion à Anatole API impossible.";

      if (attempt < MAX_ATTEMPTS) {
        await pause(450 * attempt);
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return failureResponse(lastDetail);
}
