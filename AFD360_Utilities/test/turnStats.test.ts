import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSse } from "../server/sse.ts";
import { turnStats } from "../shared/turnStats.ts";
import type { WireEntry } from "../shared/types.ts";

// Builds a stream wire entry from a recorded fixture; our clock runs 200ms behind Salesforce's (network).
async function entry(fixture: string, durationMs: number): Promise<WireEntry> {
  const raw = fs.readFileSync(path.join(import.meta.dirname, "fixtures", fixture));
  const streamEvents: WireEntry["streamEvents"] = [];
  let origin: number | null = null;
  async function* body() {
    yield new Uint8Array(raw);
  }
  for await (const ev of parseSse(body())) {
    const d = ev.data as { timestamp: number; originEventId: string };
    origin ??= parseInt(d.originEventId, 10);
    streamEvents.push({ t: d.timestamp - origin + 200, event: ev.event, data: ev.data });
  }
  return {
    id: "w1", turn: 3, label: "Send message (stream)", startedAt: new Date().toISOString(), method: "POST", url: "https://x",
    requestHeaders: {}, status: 200, responseHeaders: { "x-request-id": "req-1" }, streamEvents, durationMs,
  };
}

describe("turnStats", () => {
  it("splits Salesforce processing from network time and finds first text", async () => {
    const s = turnStats(await entry("stream-lightning.sse", 60_000));
    expect(s.sfProcessingMs).toBeGreaterThan(0);
    expect(s.networkMs).toBe(60_000 - s.sfProcessingMs!);
    expect(s.firstTextMs).toBe(1872 + 200); // first agentMessage chunk: 1791382572600 - 1791382570728
    expect(s.traceId).toBe("96e72c43575f684fbec465f008522672");
    expect(s.requestId).toBe("req-1");
    expect(s.turn).toBe(3);
  });

  it("times each progress step until the next event", async () => {
    const s = turnStats(await entry("stream-action-output.sse", 30_000));
    expect(s.steps.length).toBeGreaterThan(0);
    for (const step of s.steps) {
      expect(step.label).not.toBe("");
      expect(step.durationMs).not.toBeNull();
    }
    expect(s.contentSafe).toBe(true);
    expect(s.citedSources).toBe(0);
  });
});
