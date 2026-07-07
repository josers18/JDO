/**
 * Agentforce / Einstein prompt path.
 *
 * Ports the WORKING org mechanism used by the DC_AgentForce_Output_LWC + the
 * profile widgets: an autolaunched Flow that wraps an Einstein Prompt Template
 * action, takes an SObject record as input, and returns the generated text in a
 * `PromptResponse` output variable.
 *
 * The LWCs reach it via @AuraEnabled Apex (DcAgentforceOutputController) →
 * Flow.Interview. React can't call @AuraEnabled Apex, AND the deployed bundle's
 * app-domain session is NOT authorized to call the generic Flow Actions REST API
 * (/services/data/vXX/actions/custom/flow/* → 401 in-org, even though
 * sdk.graphql and /services/apexrest/* both work). So we go through the SAME
 * apexrest channel as the Data Cloud bridge: DcPromptRest runs the autolaunched
 * flow server-side via Flow.Interview and returns the text. Verified in-org.
 *   POST /services/apexrest/dc/prompt
 *     body: { flowApiName, recordId, recordVar, responseVar }
 *     200:  { text: "<generated summary>" }
 */
import { createDataSDK } from '@salesforce/platform-sdk';

/** One org prompt flow: its API name + the exact input-variable name it expects. */
export interface PromptFlow {
  /** Autolaunched Flow API name, e.g. 'DC_AccountSummary_Widget'. */
  flowApiName: string;
  /** Input SObject variable name — casing matters ('recordId' vs 'recordID'). */
  recordVar: string;
  /** SObject type of the input record (default 'Account'). */
  sobjectType?: string;
  /** Output text variable name (default 'PromptResponse'). */
  responseVar?: string;
}

/** Light HTML → text so a summary can render as a clean paragraph if desired. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Run an org prompt flow for a record and return the generated text.
 * Throws on flow error / unavailable surface so callers can fall back to a
 * locally-composed summary.
 */
export async function runPromptFlow(flow: PromptFlow, recordId: string): Promise<string> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  const res = await sdk.fetch('/services/apexrest/dc/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flowApiName: flow.flowApiName,
      recordId,
      recordVar: flow.recordVar,
      responseVar: flow.responseVar ?? 'PromptResponse',
    }),
  });
  const json = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Prompt flow ${flow.flowApiName} failed (HTTP ${res.status})`);
  }
  return json.text ?? '';
}
