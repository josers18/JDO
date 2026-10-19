import { describe, expect, it } from "vitest";
import { summarizeUsage } from "../server/usage.ts";

describe("summarizeUsage", () => {
  it("sums LLM rows, skips model-less rows, and ranks models by tokens", () => {
    const u = summarizeUsage("abc", [
      ["gpt-4.1-2025-04-14", 1000, 50, 1050],
      [null, 0, 0, 0], // agent / action row
      ["EinsteinHyperClassifier", 300, 2, 302],
      ["gpt-4.1-2025-04-14", "2000", "100", "2100"],
    ]);
    expect(u.rows).toBe(4);
    expect(u.llmCalls).toBe(3);
    expect(u.inputTokens).toBe(3300);
    expect(u.outputTokens).toBe(152);
    expect(u.totalTokens).toBe(3452);
    expect(u.models).toEqual([
      { model: "gpt-4.1-2025-04-14", calls: 2, inputTokens: 3000, outputTokens: 150, totalTokens: 3150 },
      { model: "EinsteinHyperClassifier", calls: 1, inputTokens: 300, outputTokens: 2, totalTokens: 302 },
    ]);
  });

  it("reports zero rows when Data 360 has nothing yet", () => {
    expect(summarizeUsage("abc", [])).toMatchObject({ rows: 0, llmCalls: 0, models: [] });
  });
});
