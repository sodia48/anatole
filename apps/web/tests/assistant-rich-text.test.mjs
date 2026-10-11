import assert from "node:assert/strict";
import test from "node:test";
import { parseAssistantRichText as parse } from "../public/assistant-rich-text.mjs";

test("headings and subheadings use distinct semantic blocks", () => {
  assert.deepEqual(parse("## Titre\n### Sous-titre").map((block) => block.type), ["heading", "subheading"]);
});

test("adjacent bullets and numbered steps become single lists", () => {
  const blocks = parse("- item 1\n- item 2\n\n1. A\n2. B");
  assert.deepEqual(blocks.map((block) => block.type), ["bullet_list", "ordered_list"]);
  assert.equal(blocks[0].items.length, 2);
  assert.equal(blocks[1].items.length, 2);
});

test("inline labels are strong while the rest stays plain text", () => {
  assert.deepEqual(parse("**Couverture :** limitée")[0].content, [
    { text: "Couverture :", strong: true }, { text: " limitée", strong: false },
  ]);
});

test("empty bullets and repeated blank lines do not create empty blocks", () => {
  assert.deepEqual(parse("-\n\n\nTexte"), [
    { type: "paragraph", content: [{ text: "Texte", strong: false }] },
  ]);
});

test("HTML and unclosed emphasis remain plain text", () => {
  assert.deepEqual(parse("<script>alert(1)</script>\n\n**broken"), [
    { type: "paragraph", content: [{ text: "<script>alert(1)</script>", strong: false }] },
    { type: "paragraph", content: [{ text: "**broken", strong: false }] },
  ]);
});

test("a preliminary label is removed without losing the direct answer", () => {
  assert.deepEqual(parse("**Réponse préliminaire :** Oui, cela dépend du statut.")[0].content,
    [{ text: "Oui, cela dépend du statut.", strong: false }]);
});

test("a source section is omitted only when structured sources exist", () => {
  const answer = "## Analyse\nTexte\n## Sources et fraîcheur\n- Source du modèle\n## Limites\nÀ vérifier.";
  assert.deepEqual(parse(answer, { collapseSources: true }).map((block) => block.type),
    ["heading", "paragraph", "heading", "paragraph"]);
  assert.equal(parse(answer).length, 6);
});

test("tables keep cells as text, bound rows, and reject missing separators", () => {
  const blocks = parse('| Rang | ETF |\n| --- | --- |\n| 1 | <img src=x onerror=alert(1)> |');
  assert.equal(blocks[0].type, 'table');
  assert.equal(blocks[0].rows[0][1][0].text, '<img src=x onerror=alert(1)>');
  assert.equal(parse('| a | b |\n| x | y |')[0].type, 'paragraph');
  assert.equal(parse('| a | b |\n| --- | --- |\n'+Array(60).fill('| a | b |').join('\n'))[0].rows.length,30);
});
