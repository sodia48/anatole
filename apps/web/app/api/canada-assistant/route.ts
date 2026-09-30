import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");

const JURISDICTIONS = new Set([
  "CA",
  "QC",
  "ON",
  "BC",
  "AB",
  "SK",
  "MB",
  "NB",
  "NS",
  "PE",
  "NL",
]);

type AssistantLink = {
  label: string;
  url: string;
  level: "federal" | "provincial" | "statistics";
};

type AssistantResponse = {
  answer: string;
  links: AssistantLink[];
  source_line: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function linkMarkup(
  links: AssistantLink[],
  language: "fr" | "en",
): string {
  return links
    .map((link) => {
      const href = safeUrl(link.url);
      if (!href) return "";

      const level =
        link.level === "statistics"
          ? language === "fr"
            ? "Statistique"
            : "Statistics"
          : link.level === "federal"
            ? language === "fr"
              ? "Fédéral"
              : "Federal"
            : "Provincial";

      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer"><span>${escapeHtml(level)}</span><strong>${escapeHtml(link.label)}</strong></a>`;
    })
    .join("");
}

function renderPage({
  language,
  jurisdiction,
  mode,
  question,
  result,
  failed,
}: {
  language: "fr" | "en";
  jurisdiction: string;
  mode: "ask" | "compare" | "find";
  question: string;
  result: AssistantResponse | null;
  failed: boolean;
}): string {
  const fr = language === "fr";

  const answer = failed
    ? fr
      ? "Je n’ai pas pu vérifier cette réponse pour le moment. Réessaie ou ouvre une ressource officielle."
      : "I could not verify this answer right now. Try again or open an official resource."
    : result?.answer ?? (
        fr
          ? "Pose une question sur une statistique, un service public ou une ressource gouvernementale."
          : "Ask about a statistic, public service or government resource."
      );

  const links = result?.links?.length
    ? `<section class="sources"><div class="sourceHeading">${fr ? "Sources gouvernementales utilisées" : "Government sources used"}</div><div class="links">${linkMarkup(result.links, language)}</div></section>`
    : "";

  const source = result?.source_line
    ? `<small>${escapeHtml(result.source_line)}</small>`
    : "";

  const userBubble = question
    ? `<article class="message user"><b>${fr ? "TOI" : "YOU"}</b><p>${escapeHtml(question)}</p></article>`
    : "";

  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canada 360 Assistant</title>
<style>
:root{color-scheme:dark;font-family:Inter,Arial,sans-serif;background:#07111b;color:#eef5fb}
*{box-sizing:border-box}body{margin:0;background:#07111b;color:#eef5fb}
main{display:grid;gap:12px;padding:14px}
header{display:flex;justify-content:space-between;gap:12px;align-items:start}
.eyebrow,b{font-size:11px;font-weight:850}.eyebrow{color:#79b9ff;letter-spacing:.08em}
h1{font-size:20px;margin:4px 0 0}.trust,small{color:#9aa9b7;font-size:11px}
form{display:grid;grid-template-columns:150px 1fr auto;gap:8px}
select,input,button{min-height:42px;border-radius:10px;border:1px solid #263747;font:inherit}
select,input{background:#0c1925;color:#eef5fb;padding:0 11px}
button{background:#1f6feb;color:white;padding:0 15px;font-weight:800;cursor:pointer}
.chat{display:grid;gap:8px;min-height:150px;padding:10px;border:1px solid #263747;border-radius:12px;background:#091520}
.message{max-width:92%;padding:10px;border:1px solid #263747;border-radius:11px;background:#0c1925}
.message.user{justify-self:end;background:#10243a}.message p{margin:5px 0 0;line-height:1.55;font-size:13px;white-space:pre-wrap}
.sources{display:grid;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #263747}.sourceHeading{color:#9aa9b7;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.links{display:grid;gap:6px}.links a{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:8px;border:1px solid #263747;border-radius:9px;color:#eef5fb;text-decoration:none;background:#091520}
.links span{color:#79b9ff;font-size:10px}.links strong{font-size:12px}
footer{color:#9aa9b7;font-size:10px;line-height:1.5}
@media(max-width:640px){main{padding:10px}header{display:grid}form{grid-template-columns:1fr}.message{max-width:96%}}
</style>
</head>
<body>
<main data-testid="canada360-assistant-shell">
<header>
<div><span class="eyebrow">CANADA 360 ASSISTANT</span><h1>${fr ? "Demande. Compare. Trouve." : "Ask. Compare. Find."}</h1></div>
<span class="trust">${fr ? "Sources officielles prioritaires" : "Official sources first"} · ${escapeHtml(jurisdiction)}</span>
</header>
<section class="chat" data-testid="canada360-assistant-chat">
${userBubble}
<article class="message"><b>CANADA 360</b><p>${escapeHtml(answer)}</p>${links}${source}</article>
</section>
<form method="get" action="/api/canada-assistant">
<input type="hidden" name="lang" value="${language}">
<input type="hidden" name="jurisdiction" value="${escapeHtml(jurisdiction)}">
<select name="mode" aria-label="Mode">
<option value="ask"${mode === "ask" ? " selected" : ""}>${fr ? "Demander" : "Ask"}</option>
<option value="compare"${mode === "compare" ? " selected" : ""}>${fr ? "Comparer" : "Compare"}</option>
<option value="find"${mode === "find" ? " selected" : ""}>${fr ? "Trouver" : "Find"}</option>
</select>
<input name="q" maxlength="500" value="${escapeHtml(question)}" aria-label="${fr ? "Question à Canada 360" : "Question for Canada 360"}" placeholder="${fr ? "Ex. Quelles prestations existent au Québec ?" : "E.g. What benefits exist in Quebec?"}">
<button type="submit">${fr ? "Envoyer" : "Send"}</button>
</form>
<footer>${fr ? "Canada 360 ne remplace pas une décision administrative et ne déduit pas ton admissibilité." : "Canada 360 does not replace an administrative decision or infer eligibility."}</footer>
</main>
</body>
</html>`;
}

export async function GET(
  request: NextRequest,
): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const language = params.get("lang") === "en" ? "en" : "fr";
  const rawJurisdiction = (
    params.get("jurisdiction") ?? "CA"
  ).toUpperCase();
  const jurisdiction = JURISDICTIONS.has(rawJurisdiction)
    ? rawJurisdiction
    : "CA";

  const rawMode = params.get("mode");
  const mode: "ask" | "compare" | "find" =
    rawMode === "compare" || rawMode === "find"
      ? rawMode
      : "ask";

  const question = (params.get("q") ?? "").trim().slice(0, 500);
  let result: AssistantResponse | null = null;
  let failed = false;

  if (question) {
    try {
      const upstream = await fetch(
        `${API_URL}/api/v1/canada/assistant`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question,
            lang: language,
            jurisdiction,
            mode,
          }),
          cache: "no-store",
        },
      );

      if (!upstream.ok) {
        failed = true;
      } else {
        result = (await upstream.json()) as AssistantResponse;
      }
    } catch {
      failed = true;
    }
  }

  return new Response(
    renderPage({
      language,
      jurisdiction,
      mode,
      question,
      result,
      failed,
    }),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
