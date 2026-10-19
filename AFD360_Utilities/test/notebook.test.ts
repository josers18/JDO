import { describe, expect, it } from "vitest";
import { addOutput, toWireEntry } from "../server/notebook.ts";
import { maskUrl } from "../server/wire.ts";
import type { NotebookOutput } from "../shared/types.ts";

const secret = "3MVG9abcdefghijklmnopSECRETxyz";

describe("maskUrl", () => {
  it("masks secret query params and leaves the rest alone", () => {
    const url = maskUrl(`https://x.my.salesforce.com/services/oauth2/token?grant_type=client_credentials&client_id=abc&client_secret=${secret}`);
    expect(url).toContain("grant_type=client_credentials&client_id=abc");
    expect(url).not.toContain(secret);
    expect(url).toContain("client_secret=3MVG9a…Txyz");
  });

  it("decodes before masking and survives bad escapes", () => {
    expect(maskUrl(`https://x/a?subject_token=${encodeURIComponent(secret + "/+=")}`)).not.toContain("SECRET");
    expect(() => maskUrl("https://x/a?token=%E0%A4%A")).not.toThrow();
  });
});

describe("toWireEntry", () => {
  it("masks the url, auth header and token bodies, and tags the cell's count as the turn", () => {
    const e = toWireEntry(
      {
        label: "Data Cloud token exchange",
        method: "POST",
        url: `https://x/services/a360/token?subject_token=${secret}`,
        startedAt: "2026-10-19T00:00:00Z",
        requestHeaders: { Authorization: `Bearer ${secret}` },
        requestBody: { subject_token: secret },
        responseBody: { access_token: secret, instance_url: "abc.c360a.salesforce.com" },
      } as never,
      3,
    );
    expect(e.turn).toBe(3);
    expect(JSON.stringify(e)).not.toContain(secret);
    expect(e.responseBody).toMatchObject({ instance_url: "abc.c360a.salesforce.com" });
  });
});

describe("addOutput", () => {
  it("merges consecutive pieces of one stream and keeps the rest apart", () => {
    const out: NotebookOutput[] = [];
    addOutput(out, { type: "stream", name: "stdout", text: "a" });
    addOutput(out, { type: "stream", name: "stdout", text: "b\n" });
    addOutput(out, { type: "stream", name: "stderr", text: "warn" });
    addOutput(out, { type: "display", mime: "text/plain", data: "42" });
    addOutput(out, { type: "stream", name: "stdout", text: "c" });
    expect(out.map((o) => (o.type === "stream" ? o.text : o.type))).toEqual(["ab\n", "warn", "display", "c"]);
  });
});
