// Shared by the Canada 360 iframe, its server renderer, and the global assistant.
// This parses a deliberately small text grammar; rendered text must still use
// textContent (DOM/React) or HTML escaping (server HTML).
export function parseAssistantRichText(text, { collapseSources = false } = {}) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  let inSourceSection = false;
  let hasAnswer = false;

  const inline = (value) => {
    const segments = [];
    let position = 0;
    while (position < value.length) {
      const open = value.indexOf("**", position);
      if (open < 0) {
        segments.push({ text: value.slice(position), strong: false });
        break;
      }
      const close = value.indexOf("**", open + 2);
      if (close < 0) {
        segments.push({ text: value.slice(position), strong: false });
        break;
      }
      if (open > position) segments.push({ text: value.slice(position, open), strong: false });
      if (close > open + 2) segments.push({ text: value.slice(open + 2, close), strong: true });
      position = close + 2;
    }
    return segments.filter((segment) => segment.text);
  };
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", content: inline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push({ type: list.type, items: list.items.map(inline) });
    list = null;
  };

  for (const raw of String(text).split(/\r?\n/)) {
    let line = raw.trim().replace(/[ \t]+/g, " ");
    if (!line) { flushParagraph(); flushList(); continue; }

    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      const title = heading[2].trim();
      inSourceSection = collapseSources && /^(?:\d+[.)]\s*)?sources(?:\s+.*)?$/i.test(title);
      if (!inSourceSection) blocks.push({ type: heading[1].length === 2 ? "heading" : "subheading", content: inline(title) });
      continue;
    }
    if (inSourceSection) continue;
    if (/^#{2,3}$/.test(line) || /^[-*]$/.test(line)) continue;
    if (collapseSources && /^sources\s*:\s*/i.test(line)) { flushParagraph(); flushList(); continue; }

    if (!hasAnswer) {
      line = line.replace(/^(?:\*\*)?(?:Réponse préliminaire|Preliminary answer)\s*:\s*(?:\*\*)?\s*/i, "").trim();
      if (!line) continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^(\d{1,2})[.)]\s+(.+)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? "bullet_list" : "ordered_list";
      if (list?.type !== type) { flushList(); list = { type, items: [] }; }
      const item = (bullet?.[1] ?? ordered?.[2] ?? "").trim();
      if (item) list.items.push(item);
      hasAnswer = true;
      continue;
    }
    flushList();
    paragraph.push(line);
    hasAnswer = true;
  }
  flushParagraph(); flushList();
  return blocks;
}
