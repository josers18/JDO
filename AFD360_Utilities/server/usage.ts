import { getOrgCredentials } from "./orgStore.ts";
import { restUrl, sfJson } from "./salesforce.ts";
import type { WireSink } from "./wire.ts";
import type { TurnUsage } from "../shared/types.ts";

const TRACE_ID = /^[0-9a-f]{16,64}$/i; // it's interpolated into SQL, so only hex gets through

// Sums one turn's LLM calls from Agentforce usage telemetry in Data 360, keyed on the Agent API traceId.
export async function turnUsage(orgId: string, traceId: string, wire?: WireSink, turn?: number | null): Promise<TurnUsage> {
  if (!TRACE_ID.test(traceId)) throw new Error("Invalid traceId");
  const { myDomain } = getOrgCredentials(orgId);
  const sql =
    "SELECT ModelProviderModelName__c, PromptInputTokenCount__c, PromptCompletionTokenCount__c, PromptTotalTokenCount__c " +
    `FROM AiAgentGenerativeAiUsage_std__dlm WHERE TelemetryTraceIdentifier__c = '${traceId}'`;
  const res = await sfJson<{ data?: unknown[][] }>({
    orgId,
    label: "Turn usage (Data 360)",
    method: "POST",
    url: restUrl(myDomain, "/ssot/query-sql"),
    body: { sql },
    turn,
    wire,
  });
  return summarizeUsage(traceId, res.data ?? []);
}

// Rows are [model, input, output, total] in SELECT order.
export function summarizeUsage(traceId: string, rows: unknown[][]): TurnUsage {
  const usage: TurnUsage = { traceId, rows: rows.length, llmCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, models: [] };
  const byModel = new Map<string, TurnUsage["models"][number]>();
  for (const [model, input, output, total] of rows) {
    if (!model) continue; // action and agent rows carry no model and no tokens
    const m = String(model);
    const i = Number(input) || 0;
    const o = Number(output) || 0;
    const t = Number(total) || 0;
    usage.llmCalls++;
    usage.inputTokens += i;
    usage.outputTokens += o;
    usage.totalTokens += t;
    const entry = byModel.get(m) ?? { model: m, calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    entry.calls++;
    entry.inputTokens += i;
    entry.outputTokens += o;
    entry.totalTokens += t;
    byModel.set(m, entry);
  }
  usage.models = [...byModel.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  return usage;
}
