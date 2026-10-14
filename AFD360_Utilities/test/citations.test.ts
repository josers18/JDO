import { describe, expect, it } from "vitest";
import { citations } from "../shared/citations.ts";
import type { WireEntry } from "../shared/types.ts";

const stream = (turn: number, startedAt: string, citedReferences: unknown[]): WireEntry => ({
  id: String(turn), turn, label: "Send message (stream)", startedAt, method: "POST", url: "https://x/messages/stream", requestHeaders: {},
  streamEvents: [{ t: 1, event: "INFORM", data: { message: { type: "Inform", message: "", citedReferences } } }],
});

describe("citations", () => {
  it("picks a title and a link from unknown item shapes, oldest turn first", () => {
    const out = citations([
      stream(2, "2026-10-08T10:02:00Z", ["https://help.example.com/a"]),
      stream(1, "2026-10-08T10:01:00Z", [
        { sourceName: "Overdraft FAQ", recordUrl: "/lightning/r/Knowledge__kav/ka0/view" },
        { type: "doc", meta: { link: "nested" }, href: "https://example.com/doc", title: "Fee schedule" },
        { id: 7 },
      ]),
    ]);
    expect(out.map((c) => [c.turn, c.title, c.url])).toEqual([
      [1, "Overdraft FAQ", "/lightning/r/Knowledge__kav/ka0/view"],
      [1, "Fee schedule", "https://example.com/doc"],
      [1, null, null],
      [2, null, "https://help.example.com/a"],
    ]);
  });

  it("ignores streams with no citations", () => {
    expect(citations([stream(1, "2026-10-08T10:01:00Z", [])])).toEqual([]);
  });
});
