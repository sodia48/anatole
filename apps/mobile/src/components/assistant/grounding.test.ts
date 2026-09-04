import { assistantIsGrounded, containsRecommendation, containsUnsupportedCausality } from "./grounding";
describe("grounded assistant guardrails", () => {
  it("accepts sourced or explicit insufficient-data answers", () => { expect(assistantIsGrounded({ answer: "Je n’ai pas suffisamment de données", sources: [] } as never)).toBe(true); expect(assistantIsGrounded({ answer: "Observation", sources: [{ label: "TSX" }] } as never)).toBe(true); });
  it("rejects unsupported causality and recommendations", () => { expect(containsUnsupportedCausality("RY monte parce que les taux baissent")).toBe(true); expect(containsRecommendation("Acheter RY")).toBe(true); });
});
