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
  "YT",
  "NT",
  "NU",
]);
const PDF_MAX_BYTES = 2 * 1024 * 1024;

type AssistantLink = {
  label: string;
  url: string;
  level: "federal" | "provincial" | "statistics";
  agency?: string | null;
  jurisdiction?: string | null;
  updated_at?: string | null;
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
  feedback?: "up" | "down" | null;
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
  intent: string;
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
    .map((link, index) => {
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

      const agency = link.agency ?? level;
      const jurisdiction = link.jurisdiction ?? "CA";
      const updated = link.updated_at
        ? `<small>${language === "fr" ? "Période / mise à jour" : "Period / update"}: ${escapeHtml(link.updated_at)}</small>`
        : "";
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer"><span>[${index + 1}] ${escapeHtml(agency)} · ${escapeHtml(jurisdiction)}</span><strong>${escapeHtml(link.label)}</strong><small>${escapeHtml(href)}</small>${updated}</a>`;
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
  index: number,
  conversationId: string,
  jurisdiction: string,
): string {
  const isUser = turn.role === "user";
  const sources = !isUser && turn.links?.length
    ? `<section class="sources"><div class="sourceHeading">${language === "fr" ? "Sources gouvernementales utilisées" : "Government sources used"}</div><div class="links">${linkMarkup(turn.links, language)}</div></section>`
    : "";

  const sourceLine = !isUser && turn.source_line
    ? `<small>${escapeHtml(turn.source_line)}</small>`
    : "";
  const speak = !isUser
    ? `<button type="button" class="speak" data-voice-speak hidden>${language === "fr" ? "Écouter la réponse" : "Listen to answer"}</button>`
    : "";

  const feedback = !isUser
    ? `<form class="feedback" method="post" action="/api/canada-assistant">
<input type="hidden" name="action" value="feedback">
<input type="hidden" name="conversation_id" value="${escapeHtml(conversationId)}">
<input type="hidden" name="turn_index" value="${index}">
<input type="hidden" name="lang" value="${language}">
<input type="hidden" name="jurisdiction" value="${escapeHtml(jurisdiction)}">
<span>${language === "fr" ? "Utile ?" : "Helpful?"}</span>
<button type="submit" name="rating" value="up" aria-label="${language === "fr" ? "Réponse utile" : "Helpful answer"}" aria-pressed="${turn.feedback === "up"}">👍</button>
<button type="submit" name="rating" value="down" aria-label="${language === "fr" ? "Réponse inutile" : "Unhelpful answer"}" aria-pressed="${turn.feedback === "down"}">👎</button>
</form>`
    : "";

  return `<article class="message ${isUser ? "user" : ""}"><b>${isUser ? (language === "fr" ? "TOI" : "YOU") : "CANADA 360"}</b><p>${escapeHtml(turn.text)}</p>${sources}${sourceLine}${speak}${feedback}</article>`;
}

function renderPage({
  language,
  jurisdiction,
  conversationId,
  conversation,
  failed,
  uploadError,
}: {
  language: "fr" | "en";
  jurisdiction: string;
  conversationId: string;
  conversation: AssistantConversation | null;
  failed: boolean;
  uploadError: string;
}): string {
  const fr = language === "fr";

  const history = conversation?.history ?? [];

  const chatMarkup = history.length
    ? history.map((turn, index) => turnMarkup(
        turn, language, index, conversationId, jurisdiction,
      )).join("")
    : `<article class="message"><b>CANADA 360</b><p>${fr ? "Pose une question sur une statistique, un service public ou une ressource gouvernementale. Je garderai le contexte de cette conversation pour affiner mes réponses." : "Ask about a statistic, public service or government resource. I will keep this conversation context to refine later answers."}</p></article>`;

  const failedMarkup = failed
    ? `<article class="message error"><b>CANADA 360</b><p>${fr ? "Je n’ai pas pu vérifier la dernière réponse. Le reste de la conversation est conservé; réessaie." : "I could not verify the last answer. The rest of the conversation is preserved; try again."}</p></article>`
    : "";
  const uploadErrorMarkup = uploadError
    ? `<article class="message error"><b>CANADA 360</b><p>${escapeHtml(uploadError)}</p></article>`
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
.disclaimer,.privacy{color:#b8c8d5;font-size:11px;line-height:1.4}
.headerActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.newChat{padding:7px 9px;border:1px solid #263747;border-radius:9px;color:#eef5fb;text-decoration:none;font-size:11px;background:#0c1925}
.memory{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border:1px solid #263747;border-radius:10px;background:#0c1925}
.memory span{font-size:10px;color:#9aa9b7}.memory strong{font-size:11px}
form{display:grid;grid-template-columns:1fr auto;gap:8px}
[data-testid="canada360-message-form"]{grid-template-columns:minmax(0,1fr) auto auto}
input,button{min-height:42px;border-radius:10px;border:1px solid #263747;font:inherit}
input{background:#0c1925;color:#eef5fb;padding:0 11px;min-width:0}
button{background:#1f6feb;color:white;padding:0 15px;font-weight:800;cursor:pointer}
.chat{display:grid;gap:8px;max-height:560px;overflow:auto;padding:10px;border:1px solid #263747;border-radius:12px;background:#091520}
.message{max-width:92%;padding:10px;border:1px solid #263747;border-radius:11px;background:#0c1925}
.message.user{justify-self:end;background:#10243a}.message.error{border-color:#7a3940}.message p{margin:5px 0 0;line-height:1.55;font-size:13px;white-space:pre-wrap}
.sources{display:grid;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #263747}.sourceHeading{color:#9aa9b7;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.links{display:grid;gap:6px}.links a{display:grid;gap:3px;padding:8px;border:1px solid #263747;border-radius:9px;color:#eef5fb;text-decoration:none;background:#091520;overflow-wrap:anywhere}
.links span{color:#79b9ff;font-size:10px}.links strong{font-size:12px}.links small{font-size:10px}
.feedback{display:flex;align-items:center;gap:6px;margin-top:10px}.feedback span{font-size:10px;color:#9aa9b7}.feedback button{min-height:28px;padding:2px 7px;background:#132536}.feedback button[aria-pressed="true"]{border-color:#79b9ff;background:#19406a}
footer{color:#9aa9b7;font-size:10px;line-height:1.5}
.speak,#voice-start{min-height:28px;padding:2px 9px;font-size:11px;background:#132536}.speak{margin-top:9px}.attachment,.consent{grid-column:1/-1;display:flex;gap:8px;align-items:center;color:#b8c8d5;font-size:11px}.attachment input{max-width:100%;font-size:11px}.consent input{width:auto;min-height:0}.voiceStatus{color:#9aa9b7;font-size:11px}
@media(max-width:640px){main{padding:10px}header{display:grid}.headerActions{justify-content:flex-start}form,[data-testid="canada360-message-form"]{grid-template-columns:1fr}.message{max-width:96%}.chat{max-height:520px}}
</style>
</head>
<body>
<main data-testid="canada360-assistant-shell">
<header>
<span class="eyebrow">CANADA 360 ASSISTANT</span>
<div class="headerActions"><span class="trust">${fr ? "13 provinces et territoires · sources officielles" : "13 provinces and territories · official sources"} · ${escapeHtml(jurisdiction)}</span><a class="newChat" href="${resetHref}" data-testid="canada360-new-conversation">${fr ? "Nouvelle conversation" : "New conversation"}</a></div>
</header>
<div class="disclaimer">${fr ? "Canada 360 est un produit Anatole indépendant, pas un service officiel du gouvernement du Canada." : "Canada 360 is an independent Anatole product, not an official Government of Canada service."}</div>
${profile}
<section class="chat" data-testid="canada360-assistant-chat">
${chatMarkup}
${failedMarkup}
${uploadErrorMarkup}
</section>
<form method="post" enctype="multipart/form-data" action="/api/canada-assistant" data-testid="canada360-message-form">
<input type="hidden" name="action" value="question">
<input type="hidden" name="lang" value="${language}">
<input type="hidden" name="jurisdiction" value="${escapeHtml(jurisdiction)}">
<input type="hidden" name="conversation_id" value="${escapeHtml(conversationId)}">
<input name="q" maxlength="500" autocomplete="off" aria-label="${fr ? "Question à Canada 360" : "Question for Canada 360"}" placeholder="${fr ? "Pose ta question à Canada 360…" : "Ask Canada 360…"}">
<button type="button" id="voice-start" hidden>${fr ? "Dicter" : "Dictate"}</button>
<button type="submit">${fr ? "Envoyer" : "Send"}</button>
<label class="attachment">${fr ? "Joindre un PDF officiel (2 Mo max)" : "Attach an official PDF (2 MB max)"}<input type="file" name="pdf" accept="application/pdf,.pdf"></label>
<label class="consent"><input type="checkbox" name="document_consent" value="on">${fr ? "Je comprends que le texte du PDF sera envoyé au service d’analyse; je masque d’abord NAS, carte et mot de passe." : "I understand the PDF text will be sent for analysis; I remove SIN, card and password details first."}</label>
</form>
<div class="voiceStatus" id="voice-status" role="status" aria-live="polite"></div>
<div class="privacy">${fr ? "Avant d'envoyer : ne saisis pas ton NAS, un numéro de carte ou un mot de passe. La dictée peut utiliser le service vocal du navigateur; relis le texte avant d'envoyer." : "Before sending: do not enter your SIN, card number or password. Dictation may use your browser's voice service; review the text before sending."}</div>
<footer>${fr ? "Le contexte de cette conversation est conservé temporairement pendant environ 2 heures; il n’est pas enregistré comme mémoire permanente de ton compte. Canada 360 ne remplace pas une décision administrative." : "This conversation context is kept temporarily for about 2 hours; it is not saved as permanent account memory. Canada 360 does not replace an administrative decision."}</footer>
</main>
<script defer src="/canada-assistant-voice.js"></script>
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

async function renderAssistant(
  request: NextRequest,
  params: URLSearchParams,
  question: string,
  options: { documentBase64?: string; uploadError?: string } = {},
): Promise<Response> {
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

  let conversation: AssistantConversation | null = null;
  let failed = false;
  let uploadError = options.uploadError ?? "";

  if (question) {
    try {
      const upstream = await fetch(
        `${API_URL}/api/v1/canada/assistant${options.documentBase64 ? "/document" : ""}`,
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
            ...(options.documentBase64
              ? { document_base64: options.documentBase64, document_consent: true }
              : {}),
          }),
          cache: "no-store",
        },
      );

      if (!upstream.ok) {
        if (options.documentBase64 && [413, 422].includes(upstream.status)) {
          uploadError = language === "fr"
            ? "PDF invalide, protégé ou sans texte lisible. Choisis un PDF de 2 Mo et 10 pages maximum."
            : "Invalid, protected, or unreadable PDF. Choose a PDF up to 2 MB and 10 pages.";
        } else {
          failed = true;
        }
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
      uploadError,
    }),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'",
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

export async function GET(request: NextRequest): Promise<Response> {
  return renderAssistant(request, request.nextUrl.searchParams, "");
}

export async function POST(request: NextRequest): Promise<Response> {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return new Response("Forbidden", { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > PDF_MAX_BYTES + 64 * 1024) {
    return new Response("PDF too large", { status: 413 });
  }

  const form = await request.formData();
  const params = new URLSearchParams();
  for (const key of ["lang", "jurisdiction", "conversation_id"]) {
    const value = form.get(key);
    if (typeof value === "string") params.set(key, value);
  }

  if (form.get("action") === "feedback") {
    const conversationId = validConversationId(params.get("conversation_id"));
    const rating = form.get("rating");
    const turnIndex = Number(form.get("turn_index"));
    if (!conversationId || !["up", "down"].includes(String(rating)) ||
        !Number.isInteger(turnIndex) || turnIndex < 0 || turnIndex > 15) {
      return new Response("Invalid feedback", { status: 400 });
    }
    const upstream = await fetch(`${API_URL}/api/v1/canada/assistant/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        turn_index: turnIndex,
        rating,
        lang: params.get("lang") === "en" ? "en" : "fr",
        jurisdiction: params.get("jurisdiction") ?? "CA",
      }),
      cache: "no-store",
    });
    if (!upstream.ok) return new Response("Feedback unavailable", { status: 502 });
    const destination = new URLSearchParams({
      lang: params.get("lang") === "en" ? "en" : "fr",
      jurisdiction: params.get("jurisdiction") ?? "CA",
      conversation_id: conversationId,
    });
    return new Response(null, {
      status: 303,
      headers: { Location: `/api/canada-assistant?${destination.toString()}` },
    });
  }

  const question = typeof form.get("q") === "string"
    ? String(form.get("q")).trim().slice(0, 500)
    : "";
  const pdf = form.get("pdf");
  if (pdf instanceof File && pdf.size > 0) {
    const french = params.get("lang") !== "en";
    if (pdf.size > PDF_MAX_BYTES) {
      return renderAssistant(request, params, "", {
        uploadError: french ? "Le PDF dépasse la limite de 2 Mo." : "The PDF exceeds the 2 MB limit.",
      });
    }
    if (form.get("document_consent") !== "on") {
      return renderAssistant(request, params, "", {
        uploadError: french
          ? "Confirme l’avertissement sur les données sensibles avant de joindre le PDF."
          : "Confirm the sensitive-data notice before attaching the PDF.",
      });
    }
    const bytes = Buffer.from(await pdf.arrayBuffer());
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return renderAssistant(request, params, "", {
        uploadError: french ? "Le fichier joint n’est pas un PDF valide." : "The attachment is not a valid PDF.",
      });
    }
    return renderAssistant(
      request, params,
      question || (french ? "Explique-moi ce document officiel." : "Explain this official document."),
      { documentBase64: bytes.toString("base64") },
    );
  }
  return renderAssistant(request, params, question);
}
