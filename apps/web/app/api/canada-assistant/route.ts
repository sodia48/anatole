import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");

const CONVERSATION_COOKIE = "canada360_conversation";
const CONVERSATION_TTL_SECONDS = 2 * 60 * 60;

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

type AssistantProfile = {
  age: number | null;
  family_status: string | null;
  employment_status: string | null;
  children: number | null;
  province: string | null;
  objective: string | null;
};

type AssistantTurn = {
  role: "user" | "assistant";
  text: string;
  links: AssistantLink[];
  source_line: string | null;
};

type AssistantConversation = {
  conversation_id: string;
  lang: "fr" | "en";
  jurisdiction: string;
  topic: string;
  profile: AssistantProfile;
  history: AssistantTurn[];
};

type AssistantResponse = AssistantConversation & {
  answer: string;
  links: AssistantLink[];
  source_line: string | null;
  mode: "ask" | "compare" | "find";
  intent: "statistics" | "services" | "followup" | "compare";
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validConversationId(value: string | null): string | null {
  if (!value) return null;
  return /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
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

function profileMarkup(
  profile: AssistantProfile | null,
  language: "fr" | "en",
): string {
  if (!profile) return "";

  const values: string[] = [];

  if (profile.age != null) {
    values.push(
      language === "fr"
        ? `${profile.age} ans`
        : `${profile.age} years old`,
    );
  }

  const family: Record<string, [string, string]> = {
    single: ["célibataire", "single"],
    married: ["marié", "married"],
    common_law: ["conjoint de fait", "common-law"],
    divorced: ["divorcé", "divorced"],
    widowed: ["veuf/veuve", "widowed"],
  };

  if (profile.family_status && family[profile.family_status]) {
    values.push(
      family[profile.family_status][language === "fr" ? 0 : 1],
    );
  }

  const work: Record<string, [string, string]> = {
    unemployed: ["sans emploi", "unemployed"],
    employed: ["en emploi", "employed"],
    student: ["étudiant", "student"],
    self_employed: ["travailleur autonome", "self-employed"],
  };

  if (profile.employment_status && work[profile.employment_status]) {
    values.push(
      work[profile.employment_status][language === "fr" ? 0 : 1],
    );
  }

  if (profile.children != null) {
    values.push(
      language === "fr"
        ? `${profile.children} enfant(s)`
        : `${profile.children} child(ren)`,
    );
  }

  if (profile.province) {
    values.push(profile.province);
  }

  if (!values.length) return "";

  return `<div class="memory" data-testid="canada360-conversation-memory"><span>${language === "fr" ? "Contexte retenu pour cette conversation" : "Context kept for this conversation"}</span><strong>${escapeHtml(values.join(" · "))}</strong></div>`;
}

function turnMarkup(
  turn: AssistantTurn,
  language: "fr" | "en",
): string {
  const isUser = turn.role === "user";
  const sources = !isUser && turn.links?.length
    ? `<section class="sources"><div class="sourceHeading">${language === "fr" ? "Sources gouvernementales utilisées" : "Government sources used"}</div><div class="links">${linkMarkup(turn.links, language)}</div></section>`
    : "";

  const sourceLine = !isUser && turn.source_line
    ? `<small>${escapeHtml(turn.source_line)}</small>`
    : "";

  return `<article class="message ${isUser ? "user" : ""}"><b>${isUser ? (language === "fr" ? "TOI" : "YOU") : "CANADA 360"}</b><p>${escapeHtml(turn.text)}</p>${sources}${sourceLine}</article>`;
}

function renderPage({
  language,
  jurisdiction,
  conversationId,
  conversation,
  failed,
}: {
  language: "fr" | "en";
  jurisdiction: string;
  conversationId: string;
  conversation: AssistantConversation | null;
  failed: boolean;
}): string {
  const fr = language === "fr";

  const history = conversation?.history ?? [];

  const chatMarkup = history.length
    ? history.map((turn) => turnMarkup(turn, language)).join("")
    : `<article class="message"><b>CANADA 360</b><p>${fr ? "Pose une question sur une statistique, un service public ou une ressource gouvernementale. Je garderai le contexte de cette conversation pour affiner mes réponses." : "Ask about a statistic, public service or government resource. I will keep this conversation context to refine later answers."}</p></article>`;

  const failedMarkup = failed
    ? `<article class="message error"><b>CANADA 360</b><p>${fr ? "Je n’ai pas pu vérifier la dernière réponse. Le reste de la conversation est conservé; réessaie." : "I could not verify the last answer. The rest of the conversation is preserved; try again."}</p></article>`
    : "";

  const profile = profileMarkup(
    conversation?.profile ?? null,
    language,
  );

  const resetHref =
    `/api/canada-assistant?lang=${language}` +
    `&jurisdiction=${encodeURIComponent(jurisdiction)}` +
    "&new=1";

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
.trust,small{color:#9aa9b7;font-size:11px}
.headerActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.newChat{padding:7px 9px;border:1px solid #263747;border-radius:9px;color:#eef5fb;text-decoration:none;font-size:11px;background:#0c1925}
.memory{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border:1px solid #263747;border-radius:10px;background:#0c1925}
.memory span{font-size:10px;color:#9aa9b7}.memory strong{font-size:11px}
form{display:grid;grid-template-columns:1fr auto;gap:8px}
input,button{min-height:42px;border-radius:10px;border:1px solid #263747;font:inherit}
input{background:#0c1925;color:#eef5fb;padding:0 11px;min-width:0}
button{background:#1f6feb;color:white;padding:0 15px;font-weight:800;cursor:pointer}
.chat{display:grid;gap:8px;max-height:560px;overflow:auto;padding:10px;border:1px solid #263747;border-radius:12px;background:#091520}
.message{max-width:92%;padding:10px;border:1px solid #263747;border-radius:11px;background:#0c1925}
.message.user{justify-self:end;background:#10243a}.message.error{border-color:#7a3940}.message p{margin:5px 0 0;line-height:1.55;font-size:13px;white-space:pre-wrap}
.sources{display:grid;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #263747}.sourceHeading{color:#9aa9b7;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.links{display:grid;gap:6px}.links a{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:8px;border:1px solid #263747;border-radius:9px;color:#eef5fb;text-decoration:none;background:#091520}
.links span{color:#79b9ff;font-size:10px}.links strong{font-size:12px}
footer{color:#9aa9b7;font-size:10px;line-height:1.5}
@media(max-width:640px){main{padding:10px}header{display:grid}.headerActions{justify-content:flex-start}form{grid-template-columns:1fr}.message{max-width:96%}.chat{max-height:520px}}
</style>
</head>
<body>
<main data-testid="canada360-assistant-shell">
<header>
<span class="eyebrow">CANADA 360 ASSISTANT</span>
<div class="headerActions"><span class="trust">${fr ? "10 provinces · sources officielles" : "10 provinces · official sources"} · ${escapeHtml(jurisdiction)}</span><a class="newChat" href="${resetHref}" data-testid="canada360-new-conversation">${fr ? "Nouvelle conversation" : "New conversation"}</a></div>
</header>
${profile}
<section class="chat" data-testid="canada360-assistant-chat">
${chatMarkup}
${failedMarkup}
</section>
<form method="get" action="/api/canada-assistant">
<input type="hidden" name="lang" value="${language}">
<input type="hidden" name="jurisdiction" value="${escapeHtml(jurisdiction)}">
<input type="hidden" name="conversation_id" value="${escapeHtml(conversationId)}">
<input name="q" maxlength="500" autocomplete="off" aria-label="${fr ? "Question à Canada 360" : "Question for Canada 360"}" placeholder="${fr ? "Pose ta question à Canada 360…" : "Ask Canada 360…"}">
<button type="submit">${fr ? "Envoyer" : "Send"}</button>
</form>
<footer>${fr ? "Le contexte de cette conversation est conservé temporairement pendant environ 2 heures; il n’est pas enregistré comme mémoire permanente de ton compte. Canada 360 ne remplace pas une décision administrative." : "This conversation context is kept temporarily for about 2 hours; it is not saved as permanent account memory. Canada 360 does not replace an administrative decision."}</footer>
</main>
</body>
</html>`;
}

async function loadConversation(
  conversationId: string,
  language: "fr" | "en",
  jurisdiction: string,
): Promise<AssistantConversation | null> {
  try {
    const response = await fetch(
      `${API_URL}/api/v1/canada/assistant/conversations/${encodeURIComponent(conversationId)}?lang=${language}&jurisdiction=${encodeURIComponent(jurisdiction)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!response.ok) return null;

    return (await response.json()) as AssistantConversation;
  } catch {
    return null;
  }
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

  const reset = params.get("new") === "1";
  const requestedId = validConversationId(
    params.get("conversation_id"),
  );
  const cookieId = validConversationId(
    request.cookies.get(CONVERSATION_COOKIE)?.value ?? null,
  );

  let conversationId = reset
    ? randomUUID()
    : requestedId ?? cookieId ?? randomUUID();

  const question = (params.get("q") ?? "").trim().slice(0, 500);
  let conversation: AssistantConversation | null = null;
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
            conversation_id: conversationId,
          }),
          cache: "no-store",
        },
      );

      if (!upstream.ok) {
        failed = true;
        conversation = await loadConversation(
          conversationId,
          language,
          jurisdiction,
        );
      } else {
        const result = (await upstream.json()) as AssistantResponse;
        conversationId = result.conversation_id || conversationId;
        conversation = result;
      }
    } catch {
      failed = true;
      conversation = await loadConversation(
        conversationId,
        language,
        jurisdiction,
      );
    }
  } else if (!reset) {
    conversation = await loadConversation(
      conversationId,
      language,
      jurisdiction,
    );
  }

  const response = new Response(
    renderPage({
      language,
      jurisdiction,
      conversationId,
      conversation,
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

  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${CONVERSATION_COOKIE}=${conversationId}; Path=/api/canada-assistant; Max-Age=${CONVERSATION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  );

  return response;
}
