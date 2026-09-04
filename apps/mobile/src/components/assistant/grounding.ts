import type { AssistantResponse } from "@/src/lib/api/types";
export function assistantIsGrounded(response: AssistantResponse): boolean { return response.answer.includes("pas suffisamment") || response.sources.length > 0; }
export function containsUnsupportedCausality(answer: string): boolean { return /\b(parce que|because)\b/i.test(answer) && !/source|preuve|evidence/i.test(answer); }
export function containsRecommendation(answer: string): boolean { return /\b(acheter|vendre|strong buy|you should buy|you should sell)\b/i.test(answer); }
