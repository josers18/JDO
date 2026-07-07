/**
 * Maps each Agentforce summary slot → the live org prompt flow that generates it.
 *
 * Only autolaunched flows that expose an SObject input + a text output are
 * REST-invocable (verified against jdo-1lrnov). Slots with no runnable flow
 * fall back to the locally-composed summary (still per-account correct).
 *
 * To light up more slots later: add the flow here once it exists in the org as
 * an AutoLaunchedFlow with an Account input variable + PromptResponse output.
 */
import type { PromptFlow } from '@shared';

export const AGENTFORCE_FLOWS: Record<string, PromptFlow> = {
  // ✦ live Einstein prompt templates (confirmed running in-org)
  account: { flowApiName: 'DC_AccountSummary_Widget', recordVar: 'recordId', sobjectType: 'Account' },
  transaction: { flowApiName: 'DC_Financial_Transaction_Summary_ALF', recordVar: 'recordID', sobjectType: 'Account' },
  // Note: trade / interaction / csat / opportunity / case / campaign have no
  // REST-runnable autolaunched flow yet → they keep the composed fallback.
};
