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
  skill?: string;
  evidence?: Array<{ sources?: Array<{ label: string; url?: string | null; freshness?: string; timestamp?: string | null }>; missing_data?: string[]; limitations?: string[] }>;
  actions?: Array<{ label: string; href: string }>;
  government_feedback?: { conversation_id: string; turn_index: number } | null;
};

type UnifiedReply = {
  answer: string;
  intent: string;
  conversation_id: string;
  permission_required: boolean;
  evidence: NonNullable<AssistantTurn["evidence"]>;
  actions: NonNullable<AssistantTurn["actions"]>;
  government_feedback?: AssistantTurn["government_feedback"];
  government_profile?: AssistantProfile | null;
};

function clientHistory(raw: FormDataEntryValue | null): AssistantTurn[] {
  if (typeof raw !== "string" || raw.length > 80_000) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-20).filter((turn): turn is AssistantTurn =>
      typeof turn === "object" && turn !== null &&
      (turn.role === "user" || turn.role === "assistant") &&
      typeof turn.text === "string" && turn.text.length <= 1200).map((turn) => ({
        role: turn.role, text: turn.text,
        links: Array.isArray(turn.links) ? turn.links.slice(0, 10).filter((link) =>
          link && typeof link.url === "string" && typeof link.label === "string")
          .map((link) => ({ label: link.label.slice(0, 200), url: link.url.slice(0, 500),
            level: ["federal", "provincial", "statistics"].includes(link.level) ? link.level : "federal",
            agency: typeof link.agency === "string" ? link.agency.slice(0, 120) : null,
            jurisdiction: typeof link.jurisdiction === "string" ? link.jurisdiction.slice(0, 10) : null,
            updated_at: typeof link.updated_at === "string" ? link.updated_at.slice(0, 80) : null })) : [],
        source_line: typeof turn.source_line === "string" ? turn.source_line.slice(0, 500) : null,
        skill: typeof turn.skill === "string" ? turn.skill.slice(0, 40) : undefined,
        evidence: Array.isArray(turn.evidence) ? turn.evidence.slice(0, 4) : undefined,
        actions: Array.isArray(turn.actions) ? turn.actions.slice(0, 5).filter((action) =>
          action && typeof action.href === "string" && typeof action.label === "string") : undefined,
        government_feedback: turn.government_feedback &&
          validConversationId(turn.government_feedback.conversation_id) &&
          Number.isInteger(turn.government_feedback.turn_index) &&
          turn.government_feedback.turn_index >= 0 && turn.government_feedback.turn_index <= 39
          ? turn.government_feedback : null,
      }));
  } catch { return []; }
}

async function renderUnified(request: NextRequest, params: URLSearchParams, question: string, form: FormData,
  options: { documentBase64?: string; uploadError?: string } = {}): Promise<Response> {
  const language = params.get("lang") === "en" ? "en" : "fr";
  const jurisdiction = JURISDICTIONS.has((params.get("jurisdiction") ?? "CA").toUpperCase())
    ? (params.get("jurisdiction") ?? "CA").toUpperCase() : "CA";
  const requestedId = validConversationId(params.get("conversation_id")) ??
    validConversationId(request.cookies.get(CONVERSATION_COOKIE)?.value ?? null);
  const turns = clientHistory(form.get("history"));
  const consent = form.get("portfolio_consent") === "on";
  let positions: unknown[] = [];
  if (consent && typeof form.get("portfolio_positions") === "string") {
    try {
      const parsed: unknown = JSON.parse(String(form.get("portfolio_positions")));
      if (Array.isArray(parsed) && parsed.length <= 30) positions = parsed;
    } catch { /* Invalid positions are rejected by the API if sent. */ }
  }
  let failed = false;
  let uploadError = options.uploadError ?? "";
  let permissionRequired = false;
  let profile: AssistantProfile | null = null;
  let conversationId = requestedId ?? randomUUID();
  if (question && !uploadError) {
    try {
      if (options.documentBase64) {
        const upstream = await fetch(`${API_URL}/api/v1/canada/assistant/document`, {
          method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ question, lang: language, jurisdiction,
            conversation_id: validConversationId(String(form.get("government_conversation_id") ?? "")),
            document_base64: options.documentBase64, document_consent: true }), cache: "no-store",
        });
        if (!upstream.ok) {
          if ([413, 422].includes(upstream.status)) uploadError = language === "fr"
            ? "PDF invalide, protégé ou sans texte lisible. Choisis un PDF de 2 Mo et 10 pages maximum."
            : "Invalid, protected, or unreadable PDF. Choose a PDF up to 2 MB and 10 pages.";
          else failed = true;
        } else {
          const result = await upstream.json() as AssistantResponse;
          profile = result.profile;
          turns.push({ role: "user", text: question, links: [], source_line: null });
          turns.push({ role: "assistant", text: result.answer, links: result.links, source_line: result.source_line,
            skill: "canada360", government_feedback: { conversation_id: result.conversation_id,
              turn_index: result.history.length - 1 } });
        }
      } else {
      const upstream = await fetch(`${API_URL}/api/v1/assistant/chat`, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, conversation_id: conversationId,
          government_conversation_id: validConversationId(String(form.get("government_conversation_id") ?? "")),
          context: { surface: "canada360", route: "/canada", language,
            metadata: { region: jurisdiction }, portfolio_scope: { authorized: consent, position_count: positions.length } },
          portfolio_consent: consent && positions.length > 0, portfolio_positions: positions }),
        cache: "no-store",
      });
      if (!upstream.ok) throw new Error(`assistant ${upstream.status}`);
      const result = await upstream.json() as UnifiedReply;
      profile = result.government_profile ?? null;
      conversationId = result.conversation_id || conversationId;
      permissionRequired = result.permission_required;
      if (form.get("resume") !== "on" || turns.at(-1)?.role !== "user" || turns.at(-1)?.text !== question) {
        turns.push({ role: "user", text: question, links: [], source_line: null });
      }
      if (!permissionRequired) turns.push({ role: "assistant", text: result.answer,
        links: [], source_line: null, skill: result.intent, evidence: result.evidence,
        actions: result.actions, government_feedback: result.government_feedback });
      }
    } catch { failed = true; }
  }
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  const response = new Response(wantsJson ? JSON.stringify({ conversation_id: conversationId,
    turns: turns.slice(-20), profile, failed, permission_required: permissionRequired, upload_error: uploadError })
    : renderPage({ language, jurisdiction, conversationId,
      conversation: { conversation_id: conversationId, lang: language, jurisdiction, topic: "", profile: profile ?? {
        age: null, family_status: null, employment_status: null, children: null, province: null, objective: null,
      }, history: turns }, failed, uploadError }), {
      headers: { "Content-Type": wantsJson ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0", "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff" },
    });
  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${CONVERSATION_COOKIE}=${conversationId}; Path=/api/canada-assistant; Max-Age=${CONVERSATION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
  return response;
}

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
    ? `<details class="sources"><summary>${language === "fr" ? "Sources officielles" : "Official sources"} (${turn.links.length})</summary><div class="links">${linkMarkup(turn.links, language)}</div></details>`
    : "";

  const sourceLine = !isUser && turn.source_line
    ? `<small>${escapeHtml(turn.source_line)}</small>`
    : "";
  const evidenceSources = !isUser && Array.isArray(turn.evidence)
    ? turn.evidence.flatMap((row) => Array.isArray(row?.sources) ? row.sources : []) : [];
  const evidenceMarkup = evidenceSources.length
    ? `<details class="sources"><summary>${language === "fr" ? "Sources et données utilisées" : "Sources and data used"}</summary><div class="links">${evidenceSources.map((source) => {
      if (typeof source.label !== "string") return "";
      const label = escapeHtml(source.label);
      const href = typeof source.url === "string" ? safeUrl(source.url) : null;
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`
        : `<span>${label}</span>`;
    }).join("")}</div></details>` : "";
  const speak = !isUser
    ? `<button type="button" class="speak" data-voice-speak hidden>${language === "fr" ? "Écouter la réponse" : "Listen to answer"}</button>`
    : "";

  const feedbackId = turn.government_feedback?.conversation_id ?? conversationId;
  const feedbackIndex = turn.government_feedback?.turn_index ?? index;
  const feedback = !isUser && (!turn.skill || turn.government_feedback)
    ? `<form class="feedback" method="post" action="/api/canada-assistant">
<input type="hidden" name="action" value="feedback">
<input type="hidden" name="conversation_id" value="${escapeHtml(feedbackId)}">
<input type="hidden" name="turn_index" value="${escapeHtml(String(feedbackIndex))}">
<input type="hidden" name="lang" value="${language}">
<input type="hidden" name="jurisdiction" value="${escapeHtml(jurisdiction)}">
<span>${language === "fr" ? "Utile ?" : "Helpful?"}</span>
<button type="submit" name="rating" value="up" aria-label="${language === "fr" ? "Réponse utile" : "Helpful answer"}" aria-pressed="${turn.feedback === "up"}">👍</button>
<button type="submit" name="rating" value="down" aria-label="${language === "fr" ? "Réponse inutile" : "Unhelpful answer"}" aria-pressed="${turn.feedback === "down"}">👎</button>
</form>`
    : "";

  const skill = !isUser && turn.skill ? `<small class="skillChip">${escapeHtml(turn.skill)}</small>` : "";
  const actions = !isUser ? (turn.actions ?? []).filter((action) => /^\/(?:focus\/[A-Z0-9.^-]{1,15}|etf(?:\/[A-Z0-9.^-]{1,15})?|portefeuille|comparateur(?:\?symbols=[A-Z0-9.^,-]{1,80})?|actualites|canada|terminal|screener|assistant|qualite)$/.test(action.href))
    .map((action) => `<a class="assistantAction" href="${escapeHtml(action.href)}" target="_parent">${escapeHtml(action.label)} →</a>`).join("") : "";
  return `<article class="message ${isUser ? "user" : ""}"><b>${isUser ? (language === "fr" ? "TOI" : "YOU") : "ANATOLE"}</b>${skill}<p>${escapeHtml(turn.text)}</p>${evidenceMarkup || sources}${sourceLine}${actions}${speak}${feedback}</article>`;
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
    : "";

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
<html lang="${language}" class="no-js">
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
html,body{height:100%;overflow:hidden}body{background:radial-gradient(circle at 50% 35%,#123451 0,#091c2d 35%,#07111b 75%)}
main{height:100dvh;min-height:0;display:flex;flex-direction:column;gap:8px;padding:10px clamp(10px,2vw,24px)}
header{flex:0 0 auto;align-items:center}.headerActions{flex-wrap:nowrap}.trust{white-space:nowrap}
.trustChip{border:1px solid #315778;border-radius:999px;padding:5px 9px;background:#10283b;color:#aad6f5;font-size:10px}
.disclaimer{flex:0 0 auto}.memory{flex:0 0 auto}.privacy,footer{flex:0 0 auto}
.chat{flex:1;min-height:0;max-height:none;display:flex;flex-direction:column;align-items:center;gap:18px;overflow-y:auto;overscroll-behavior:contain;border:0;background:transparent;padding:16px 6px 24px;scrollbar-gutter:stable}
.chat:empty{display:none}.message{width:min(100%,920px);max-width:none;padding:8px 4px;border:0;border-radius:0;background:transparent;flex:0 0 auto}
.message.user{width:fit-content;max-width:min(80%,720px);align-self:flex-end;margin-right:max(0px,calc((100% - 920px)/2));padding:11px 16px;border-radius:18px 18px 5px 18px;background:#183650}
.message.error{border:1px solid #95505a;border-radius:12px;padding:12px;background:#351b27}
.message p{font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.message b{color:#98cfff}.message.user b{color:#c8e2f6}
.sources{display:block;margin-top:12px;border-top:1px solid #294257;padding-top:10px}.sources summary{width:fit-content;cursor:pointer;color:#acd5f3;font-size:11px;font-weight:750}.links{margin-top:10px}
.links span{display:block;padding:7px 3px;color:#b7c9d6;font-size:11px}.assistantAction{display:inline-block;margin:9px 8px 0 0;padding:6px 9px;border:1px solid #385b73;border-radius:8px;color:#b9dfff;text-decoration:none;font-size:11px}.skillChip{display:inline-block;margin-left:8px;padding:3px 7px;border:1px solid #385b73;border-radius:999px;color:#acd5f3;font-size:10px}.permission{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;border:1px solid #385b73;border-radius:12px}.permission strong{width:100%;font-size:12px}.permission button{padding:7px 10px;background:#17324a;color:#fff}
.pending p{color:#b8d8ee}.dots::after{content:'…';animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{50%{opacity:.35}}
.emptyHero{flex:1;min-height:0;display:grid;place-content:end center;text-align:center;padding:25px 10px 12px}.emptyHero h1{font-size:clamp(23px,4vw,38px);line-height:1.2;margin:0 0 8px;color:#f3f9ff;letter-spacing:-.035em}.emptyHero p{font-size:12px;color:#b8c8d5;margin:0}
.composerWrap{position:relative;flex:0 0 auto;width:min(100%,950px);margin:0 auto}.composerWrap.empty{margin-bottom:auto}
[data-testid="canada360-message-form"]{display:flex;align-items:end;gap:8px;padding:9px 11px;border:1px solid #386182;border-radius:24px;background:#102437;box-shadow:0 16px 40px #0005;transition:border-color .18s,box-shadow .18s}
[data-testid="canada360-message-form"]:focus-within{border-color:#79b9ff;box-shadow:0 0 0 2px #79b9ff55,0 16px 40px #0005}
.composerButton{flex:0 0 auto;min-width:40px;height:40px;min-height:40px;border:0;border-radius:50%;padding:0 8px;background:#1c3d58;color:#eef5fb;font-size:17px}
.composerButton:hover,.newChat:hover{background:#245372}.sendButton{border-radius:15px;background:#1877ce;font-size:12px}.sendButton:disabled{opacity:.55;cursor:wait}
#voice-start.composerButton{min-width:40px;height:40px;min-height:40px;padding:0 8px;font-size:17px;background:#1c3d58;border:0;border-radius:50%}
textarea[name="q"]{flex:1;min-width:0;min-height:40px;max-height:150px;resize:none;border:0;outline:0;background:transparent;color:#eef5fb;padding:10px 5px;font:inherit;font-size:14px;line-height:20px}
textarea[name="q"]::placeholder{color:#aec3d2}.tools{position:relative}.toolsPanel{position:absolute;bottom:48px;left:0;z-index:3;width:min(320px,86vw);padding:12px;border:1px solid #386182;border-radius:14px;background:#102437;box-shadow:0 14px 32px #0008}
.toolsPanel[hidden],.emptyHero[hidden],.lastMessage[hidden]{display:none}.toolsPanel .attachment,.toolsPanel .consent{display:grid;gap:5px;margin:0 0 9px;font-size:11px}.toolsPanel .consent{display:flex;align-items:start}.toolsPanel input[type="file"]{min-height:0}.toolsPanel input[type="checkbox"]{margin-top:2px}
.lastMessage{position:absolute;right:10px;bottom:calc(100% + 10px);border-radius:999px;border:1px solid #456e8e;background:#173650;box-shadow:0 7px 18px #0008;font-size:11px;min-height:34px;padding:0 12px}
.voiceStatus:empty{display:none}.voiceStatus{width:min(100%,950px);margin:0 auto}.privacy,footer{font-size:11px}.chatShell{flex:1;min-height:0;display:flex;flex-direction:column}
.chatShell.empty{justify-content:center}.chatShell.empty .emptyHero{flex:0;padding:0 10px 22px}.chatShell.empty .composerWrap{margin:0 auto}.chat[hidden]{display:none}
.no-js #tools-toggle{display:none}.no-js .toolsPanel[hidden]{display:block;position:static;width:100%;box-shadow:none}.no-js [data-testid="canada360-message-form"]{flex-wrap:wrap}.no-js .tools{order:3;width:100%}.no-js textarea[name="q"]{flex-basis:100%}
html[data-theme="blue"]{color-scheme:light;background:#f5faff;color:#15324b}html[data-theme="blue"] body{background:radial-gradient(circle at 50% 36%,#e6f5ff,#f5faff 68%);color:#15324b}
html[data-theme="blue"] .emptyHero h1{color:#143452}html[data-theme="blue"] .trustChip{background:#e7f3fb;color:#205475;border-color:#b9d5e8}
html[data-theme="blue"] .newChat,html[data-theme="blue"] .memory{background:#fff;color:#15324b;border-color:#c6dbe9}
html[data-theme="blue"] [data-testid="canada360-message-form"],html[data-theme="blue"] .toolsPanel{background:#fff;border-color:#a8c8de;box-shadow:0 14px 30px #173e6726}
html[data-theme="blue"] textarea[name="q"]{color:#15324b}html[data-theme="blue"] textarea[name="q"]::placeholder{color:#53738c}
html[data-theme="blue"] .composerButton{background:#e2f0fa;color:#164f79}html[data-theme="blue"] .sendButton{background:#1269ad;color:#fff}
html[data-theme="blue"] #voice-start.composerButton{background:#e2f0fa;color:#164f79}
html[data-theme="blue"] .message.user{background:#dceffc;color:#15324b}html[data-theme="blue"] .message b,html[data-theme="blue"] .sources summary{color:#145f99}
html[data-theme="blue"] .message.error{background:#fff1f1;color:#602b32}html[data-theme="blue"] .links a{background:#fff;color:#15324b;border-color:#c6dbe9}
html[data-theme="blue"] .feedback button,html[data-theme="blue"] .speak{background:#e6f2fa;color:#15324b}html[data-theme="blue"] .lastMessage{background:#fff;color:#145078;border-color:#a8c8de}
@media(max-width:640px){header{display:flex;align-items:center}.trust{display:none}.chat{padding:10px 2px 20px}.message.user{max-width:86%;margin-right:0}.composerButton,#voice-start.composerButton{min-width:36px;height:36px;min-height:36px}.sendButton{font-size:11px}[data-testid="canada360-message-form"]{gap:4px;padding:7px}.emptyHero{padding-top:16px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
</style>
</head>
<body>
<main data-testid="canada360-assistant-shell">
<header>
<span class="eyebrow">ANATOLE ASSISTANT · CANADA 360</span>
<div class="headerActions"><span class="trustChip">${fr ? "Sources adaptées à la réponse" : "Sources for each answer"}</span><span class="trust">13 · ${escapeHtml(jurisdiction)}</span><a class="newChat" href="${resetHref}" data-testid="canada360-new-conversation">${fr ? "Nouvelle conversation" : "New conversation"}</a></div>
</header>
<div class="disclaimer">${fr ? "Canada 360 est un produit Anatole indépendant, pas un service officiel du gouvernement du Canada." : "Canada 360 is an independent Anatole product, not an official Government of Canada service."}</div>
<div id="conversation-memory">${profile}</div>
<div class="chatShell ${history.length ? "" : "empty"}" id="chat-shell">
<div class="emptyHero" id="empty-hero" ${history.length ? "hidden" : ""}><h1>${fr ? "Que veux-tu savoir sur le Canada ?" : "What would you like to know about Canada?"}</h1><p>${fr ? "Statistiques, services publics, titres et portefeuille, avec les sources propres à chaque sujet." : "Statistics, public services, stocks and portfolio, with sources for each topic."}</p></div>
<section class="chat" data-testid="canada360-assistant-chat" ${history.length || failed || uploadError ? "" : "hidden"}>
${chatMarkup}
${failedMarkup}
${uploadErrorMarkup}
</section>
<div class="composerWrap ${history.length ? "" : "empty"}" id="composer-wrap">
<button class="lastMessage" id="last-message" type="button" hidden>${fr ? "↓ Dernier message" : "↓ Latest message"}</button>
<form method="post" enctype="multipart/form-data" action="/api/canada-assistant" data-testid="canada360-message-form">
<input type="hidden" name="action" value="question">
<input type="hidden" name="lang" value="${language}">
<input type="hidden" name="jurisdiction" value="${escapeHtml(jurisdiction)}">
<input type="hidden" name="conversation_id" value="${escapeHtml(conversationId)}">
<input type="hidden" name="history" value="${escapeHtml(JSON.stringify(history.slice(-20)))}">
<input type="hidden" name="resume" value="">
<input type="hidden" name="portfolio_consent" value="">
<input type="hidden" name="portfolio_positions" value="">
<input type="hidden" name="government_conversation_id" value="">
<div class="tools"><button type="button" class="composerButton" id="tools-toggle" aria-label="${fr ? "Outils et PDF" : "Tools and PDF"}" aria-expanded="false" aria-controls="tools-panel">+</button><div class="toolsPanel" id="tools-panel" hidden>
<label class="attachment">${fr ? "Joindre un PDF officiel (2 Mo max)" : "Attach an official PDF (2 MB max)"}<input type="file" name="pdf" accept="application/pdf,.pdf"></label>
<label class="consent"><input type="checkbox" name="document_consent" value="on">${fr ? "Je comprends que le texte du PDF sera envoyé au service d’analyse; je masque d’abord NAS, carte et mot de passe." : "I understand the PDF text will be sent for analysis; I remove SIN, card and password details first."}</label></div></div>
<textarea name="q" maxlength="500" rows="1" aria-label="${fr ? "Question à Canada 360" : "Question for Canada 360"}" placeholder="${fr ? "Pose ta question à Canada 360…" : "Ask Canada 360…"}"></textarea>
<button type="button" class="composerButton" id="voice-start" aria-label="${fr ? "Dicter" : "Dictate"}" hidden>🎙</button>
<button type="submit" class="composerButton sendButton" id="send-message" aria-label="${fr ? "Envoyer" : "Send"}">${fr ? "Envoyer" : "Send"}</button>
</form>
</div></div>
<div class="voiceStatus" id="voice-status" role="status" aria-live="polite"></div>
<div class="privacy">${fr ? "Avant d'envoyer : ne saisis pas ton NAS, un numéro de carte ou un mot de passe. La dictée peut utiliser le service vocal du navigateur; relis le texte avant d'envoyer." : "Before sending: do not enter your SIN, card number or password. Dictation may use your browser's voice service; review the text before sending."}</div>
<footer>${fr ? "Le contexte de cette conversation est conservé temporairement pendant environ 2 heures; il n’est pas enregistré comme mémoire permanente de ton compte. Canada 360 ne remplace pas une décision administrative." : "This conversation context is kept temporarily for about 2 hours; it is not saved as permanent account memory. Canada 360 does not replace an administrative decision."}</footer>
</main>
<script defer src="/canada-assistant-voice.js"></script>
<script defer src="/canada-assistant-chat.js"></script>
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

  const conversationId = reset
    ? randomUUID()
    : requestedId ?? cookieId ?? randomUUID();

  const conversation = reset ? null : await loadConversation(conversationId, language, jurisdiction);
  const response = new Response(renderPage({
      language,
      jurisdiction,
      conversationId,
      conversation,
      failed: false,
      uploadError: "",
    }),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'",
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
  return renderAssistant(request, request.nextUrl.searchParams);
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
        !Number.isInteger(turnIndex) || turnIndex < 0 || turnIndex > 39) {
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
    if (request.headers.get("accept")?.includes("application/json")) {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
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
      return renderUnified(request, params, "", form, {
        uploadError: french ? "Le PDF dépasse la limite de 2 Mo." : "The PDF exceeds the 2 MB limit.",
      });
    }
    if (form.get("document_consent") !== "on") {
      return renderUnified(request, params, "", form, {
        uploadError: french
          ? "Confirme l’avertissement sur les données sensibles avant de joindre le PDF."
          : "Confirm the sensitive-data notice before attaching the PDF.",
      });
    }
    const bytes = Buffer.from(await pdf.arrayBuffer());
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return renderUnified(request, params, "", form, {
        uploadError: french ? "Le fichier joint n’est pas un PDF valide." : "The attachment is not a valid PDF.",
      });
    }
    return renderUnified(
      request, params,
      question || (french ? "Explique-moi ce document officiel." : "Explain this official document."),
      form, { documentBase64: bytes.toString("base64") },
    );
  }
  return renderUnified(request, params, question, form);
}
