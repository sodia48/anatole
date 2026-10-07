export type AssistantInline = { text: string; strong: boolean };
export type AssistantRichTextBlock =
  | { type: "heading"; content: AssistantInline[] }
  | { type: "subheading"; content: AssistantInline[] }
  | { type: "paragraph"; content: AssistantInline[] }
  | { type: "bullet_list"; items: AssistantInline[][] }
  | { type: "ordered_list"; items: AssistantInline[][] };

export function parseAssistantRichText(
  text: string,
  options?: { collapseSources?: boolean },
): AssistantRichTextBlock[];
