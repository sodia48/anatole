// Shared by the Canada 360 iframe, its server renderer, and the global assistant.
// This parses a deliberately small text grammar; rendered text must still use
// textContent (DOM/React) or HTML escaping (server HTML).
export function parseAssistantRichText(text, { collapseSources = false } = {}) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  let table = [];
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
  const flushTable = () => {
    if (table.length > 1 && /^\|(?:\s*:?-+:?\s*\|)+$/.test(table[1])) {
      const cells = (row) => row.slice(1, -1).split("|").slice(0, 8).map((cell) => inline(cell.trim()));
      blocks.push({ type: "table", headers: cells(table[0]), rows: table.slice(2, 32).map(cells) });
    } else if (table.length) blocks.push({ type: "paragraph", content: inline(table.join(" ")) });
    table = [];
  };

  for (const raw of String(text).split(/\r?\n/)) {
    let line = raw.trim().replace(/[ \t]+/g, " ");
    if (!inSourceSection && line.startsWith("|") && line.endsWith("|")) { flushParagraph(); flushList(); table.push(line); continue; }
    flushTable();
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
  flushTable(); flushParagraph(); flushList();
  return blocks;
}

// DOM rendering is shared by both chats; model text never becomes HTML.
export function renderAssistantRichText(value, options) {
  const body = document.createDocumentFragment();
  const inline = (node, segments) => {
    for (const segment of segments) {
      if (segment.strong) { const strong = document.createElement("strong"); strong.textContent = segment.text; node.append(strong); }
      else node.append(document.createTextNode(segment.text));
    }
  };
  for (const block of parseAssistantRichText(value, options)) {
    if (block.type === "table") {
      const table = document.createElement("table");
      const head = document.createElement("thead"), rows = document.createElement("tbody");
      for (const [index, cells] of [block.headers, ...block.rows].entries()) {
        const row = document.createElement("tr");
        for (const cell of cells) { const node = document.createElement(index ? "td" : "th"); if (!index) node.scope = "col"; inline(node, cell); row.append(node); }
        (index ? rows : head).append(row);
      }
      table.append(head, rows); body.append(table);
    } else if (block.type === "bullet_list" || block.type === "ordered_list") {
      const list = document.createElement(block.type === "ordered_list" ? "ol" : "ul");
      for (const item of block.items) { const row = document.createElement("li"); inline(row, item); list.append(row); }
      body.append(list);
    } else {
      const node = document.createElement(block.type === "heading" ? "h3" : block.type === "subheading" ? "h4" : "p");
      inline(node, block.content); body.append(node);
    }
  }
  return body;
}
