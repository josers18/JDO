import { Router } from "express";
import { buildConnectRequest, operationKey, type ConnectCatalog } from "../shared/connect.ts";
import snapshot from "./connect-catalog.json" with { type: "json" };
import { getOrgCredentials } from "./orgStore.ts";
import { sfJson, SfError } from "./salesforce.ts";
import type { WireEntry } from "../shared/types.ts";

const catalog: ConnectCatalog = snapshot;
const operations = new Map(catalog.operations.map((op) => [operationKey(op), op]));
export const connectApi = Router();
connectApi.get("/catalog", (_req, res) => res.json(catalog));
connectApi.post("/call", async (req, res) => {
  const wire: WireEntry[] = [];
  try {
    const input = req.body ?? {};
    const op = operations.get(input.operation);
    if (!op) throw Error("Unknown Connect API operation.");
    if (op.method !== "GET" && input.approved !== true) throw Error("Review and approve this request before sending.");
    const request = buildConnectRequest(op, input, Number(catalog.version));
    const org = getOrgCredentials(input.orgId);
    await sfJson({
      orgId: input.orgId,
      label: op.title,
      method: op.method,
      url: org.myDomain + request.path,
      headers: request.headers,
      body: request.body,
      wire: (entry) => {
        if (!wire.includes(entry)) wire.push(entry);
      },
    });
    res.json({ wire });
  } catch (e) {
    res
      .status(e instanceof SfError ? 502 : 400)
      .json({ error: e instanceof SfError ? `Salesforce returned HTTP ${e.status}.` : (e as Error).message, wire });
  }
});
