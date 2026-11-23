import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectApi } from "../server/connectRoutes.ts";
import { sfJson } from "../server/salesforce.ts";

vi.mock("../server/orgStore.ts", () => ({
  getOrgCredentials: () => ({ myDomain: "https://demo.my.salesforce.com" }),
}));
vi.mock("../server/salesforce.ts", async (original) => ({
  ...(await original<typeof import("../server/salesforce.ts")>()), sfJson: vi.fn(),
}));

function call(body: Record<string, unknown>) {
  return new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) { status = code; return this; },
      json(data: unknown) { resolve({ status, data }); },
    };
    connectApi({ method: "POST", url: "/call", body } as Request, res as Response, reject);
  });
}

describe("Connect call approval", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects all four write methods before contacting Salesforce", async () => {
    for (const operation of ["POST /ssot/data-spaces", "PATCH /ssot/data-spaces/{idOrName}", "DELETE /ssot/data-spaces/{idOrName}", "PUT /ssot/activations/{activationId}"]) {
      const result = await call({ orgId: "demo", operation, version: 67, values: {} });
      expect(result).toEqual({ status: 400, data: { error: "Review and approve this request before sending.", wire: [] } });
    }
    expect(sfJson).not.toHaveBeenCalled();
  });
  it("sends the catalog method and approved payload to the configured org", async () => {
    const body = { name: "TestSpace" };
    const result = await call({ orgId: "demo", approved: true, operation: "POST /ssot/data-spaces", version: 67,
      values: {}, body, method: "DELETE", url: "https://other.example" });
    expect(result.status).toBe(200);
    expect(sfJson).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      method: "POST", orgId: "demo", url: "https://demo.my.salesforce.com/services/data/v67.0/ssot/data-spaces", body,
    }));
  });
});
