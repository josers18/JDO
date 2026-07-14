/**
 * Agentforce text-generation path for React UI bundles.
 *
 * Same apexrest-bridge constraint as promptClient / crmWriteClient: the bundle's
 * app-domain session can only reach /services/apexrest/*. So generative chips
 * post to AiGenerateRest, which runs the Agentforce Models API server-side.
 *
 * RESILIENCE CONTRACT: generateText NEVER rejects for "feature off". If the
 * server reports source:'unavailable' (Models API not enabled) it resolves with
 * empty text + that source, so the caller keeps its locally-composed answer. It
 * rejects ONLY on a transport / 5xx error, which the caller surfaces quietly.
 *   POST /services/apexrest/ai/generate
 *     body: { task, prompt, context }
 *     200:  { text, source }
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export type AiGenerateTask = 'queue_rationale' | 'pipeline_summary' | 'followups' | 'freeform';

export interface AiGenerateInput {
  /** Which chip is asking — allowlisted server-side. */
  task: AiGenerateTask;
  /** The instruction line. */
  prompt: string;
  /** List/aggregate blob (queue, pipeline, drafts) the model should ground on. */
  context?: string;
}

export interface AiGenerateResult {
  text: string;
  /** 'model' = Agentforce generated it; 'unavailable' = feature off (empty text); 'composed' is set by callers, never by this client. */
  source: 'model' | 'composed' | 'unavailable';
}

/**
 * Ask the org to generate text. Resolves with the model text on success, or
 * `{ text:'', source:'unavailable' }` when the Models API is off. Rejects only
 * on a real transport / server error so the caller can note it.
 */
export async function generateText(input: AiGenerateInput): Promise<AiGenerateResult> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  const res = await sdk.fetch('/services/apexrest/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: input.task, prompt: input.prompt, context: input.context ?? '' }),
  });
  const json = (await res.json()) as { text?: string; source?: AiGenerateResult['source']; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Text generation failed (HTTP ${res.status})`);
  }
  return { text: json.text ?? '', source: json.source ?? 'unavailable' };
}
