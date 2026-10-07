import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSse } from "../server/sse.ts";
import { TurnNormalizer } from "../server/normalize.ts";
import type { AppEvent } from "../shared/types.ts";

async function run(fixture: string, chunkSize = 97) {
  const raw = fs.readFileSync(path.join(import.meta.dirname, "fixtures", fixture));
  // Feed the body in odd-sized chunks so SSE lines and JSON pieces split across reads.
  async function* body() {
    for (let i = 0; i < raw.length; i += chunkSize) yield new Uint8Array(raw.subarray(i, i + chunkSize));
  }
  const n = new TurnNormalizer();
  const events: AppEvent[] = [];
  for await (const ev of parseSse(body())) events.push(...n.push(ev));
  return { events, final: n.finalParts() };
}

describe("TurnNormalizer — LightningChunk stream", () => {
  it("streams text deltas that rebuild each message segment", async () => {
    const { events } = await run("stream-lightning.sse");
    const bySegment = new Map<number, string>();
    for (const e of events) if (e.type === "text-delta") bySegment.set(e.segment, (bySegment.get(e.segment) ?? "") + e.text);
    const texts = [...bySegment.values()];
    expect(texts[0]).toBe("Let me pull up your top open opportunities right now!");
    expect(texts[1]).toContain("| 1 | [Innovation Pipeline](/lightning/r/Opportunity/");
    expect(texts[1]).toContain("\n\n"); // JSON escapes decoded
  });

  it("emits live tool updates: running then success for the same tool id", async () => {
    const { events } = await run("stream-lightning.sse");
    const tools = events.flatMap((e) => (e.type === "tool" ? [e.tool] : []));
    expect(tools.map((t) => t.status)).toEqual(["running", "success"]);
    expect(new Set(tools.map((t) => t.id)).size).toBe(1);
    expect(tools[1]).toMatchObject({ description: "Finding Salesforce records (Opportunity)", count: "5" });
  });

  it("builds final parts from Inform.result (Inform.message is empty in this mode)", async () => {
    const { final } = await run("stream-lightning.sse");
    expect(final.map((p) => p.kind)).toEqual(["text", "tools", "text"]);
    const tools = final[1].kind === "tools" ? final[1].tools : [];
    expect(tools).toHaveLength(1); // deduped by id, last status wins
    expect(tools[0].status).toBe("success");
  });

  it("emits end-of-turn", async () => {
    const { events } = await run("stream-lightning.sse");
    expect(events.at(-1)).toEqual({ type: "end-of-turn" });
  });
});

describe("TurnNormalizer — Confirm (action approval)", () => {
  it("turns a Confirm into text, tool and action parts and exposes the pending approval", async () => {
    const raw = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "stream-confirm.sse"));
    const n = new TurnNormalizer();
    async function* body() {
      yield new Uint8Array(raw);
    }
    for await (const ev of parseSse(body())) n.push(ev);
    const final = n.finalParts();
    const actions = final.filter((p) => p.kind === "action");
    expect(final[0]).toMatchObject({ kind: "text" });
    expect(final.some((p) => p.kind === "tools")).toBe(true);
    expect(actions).toHaveLength(10);
    expect(actions[0]).toMatchObject({ kind: "action", actionType: "copilotActionInput/EmployeeCopilot__UpdateRecordFields" });
    const pending = n.pendingConfirm();
    expect(pending?.messageId).toBe("acc1888a-65b6-45ee-9a30-cd0e56967c95");
    expect(pending?.items).toHaveLength(10); // only action inputs are sent back in the Reply
    expect(pending?.items.every((i) => i.type.startsWith("copilotActionInput/"))).toBe(true);
  });
});

describe("TurnNormalizer — step trail (agent delegation)", () => {
  // One tool id is re-reported with a new description per step; the final Inform only has the last state.
  it("keeps every step of a tool, in order, while streaming and in the final parts", async () => {
    const { events, final } = await run("stream-delegation.sse");
    const live = events.flatMap((e) => (e.type === "tool" ? [e.tool] : [])).at(-1)!;
    expect(live.steps?.map((s) => s.description)).toEqual([
      "Delegating to D360 Agent",
      "D360 Agent: Analyzing your request...",
      "D360 Agent: Understanding your request...",
      "D360 Agent: Determining next steps...",
      "D360 Agent: Working on your request",
      "D360 Agent: Routing request...",
      expect.stringMatching(/^D360 Agent: Planning — The user wants the latest Moody's/),
      "D360 Agent: Generating SQL: Get the latest Moody's information for Omega Inc",
      "D360 Agent: Run SQL — Found 0 rows — columns: result",
      expect.stringMatching(/^D360 Agent: Planning — The query returned 0 rows/),
      "Delegating to D360 Agent - Trying a different angle",
    ]);
    // Earlier steps are done; the last carries the tool's final status.
    expect(live.steps!.slice(0, -1).every((s) => s.status === "success")).toBe(true);
    expect(live.steps!.at(-1)!.status).toBe("error");

    const tools = final.flatMap((p) => (p.kind === "tools" ? p.tools : []));
    expect(tools).toHaveLength(1);
    expect(tools[0].steps).toHaveLength(11);
  });
});

describe("TurnNormalizer — Text stream", () => {
  it("turns ProgressIndicator into progress events and final progress parts", async () => {
    const { events, final } = await run("stream-text.sse");
    expect(events.filter((e) => e.type === "progress").map((e) => (e as { text: string }).text)).toEqual([
      "Let me pull up your top open opportunities right now!",
      "Finding Salesforce records (Opportunity) - 5 results",
    ]);
    expect(final.map((p) => p.kind)).toEqual(["progress", "progress", "text"]);
    expect(final[2].kind === "text" && final[2].markdown).toContain("Innovation Pipeline");
  });
});
