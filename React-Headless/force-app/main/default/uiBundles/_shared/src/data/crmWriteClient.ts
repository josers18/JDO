/**
 * CRM write path for React UI bundles.
 *
 * WHY REST (same constraint as promptClient / DcBridgeRest): a Multi-Framework
 * UI bundle's app-domain session cannot call @AuraEnabled Apex or the generic
 * record/write REST APIs — only /services/apexrest/* is reachable via the SDK
 * fetch() path. So writes go through the custom `CrmWriteRest` Apex resource,
 * which performs the DML (Task / Event / Case) or sends the email server-side.
 *
 *   POST /services/apexrest/crm/write
 *     body: { action, subject, description?, whoId?, whatId?, accountId?,
 *             dueDate?, activityDateTime?, durationMinutes?, priority?,
 *             status?, toAddress?, htmlBody? }
 *     200:  { success: true, id: "<recordId | null>" }
 *     4xx/5xx: { success: false, error: "message" }
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export type CrmAction = 'task' | 'event' | 'case' | 'email' | 'update';

export interface CrmWriteInput {
  action: CrmAction;
  /** Required for every action except 'update' edits that don't touch it. */
  subject?: string;
  description?: string;
  /** Contact/Lead the activity is about (Task/Event). */
  whoId?: string;
  /** Related record the activity is on (Task/Event). */
  whatId?: string;
  /** Account for a Case. */
  accountId?: string;
  /** SObject to update (required when action === 'update'). */
  sobjectType?: 'Task' | 'Event';
  /** Id of the record to update (required when action === 'update'). */
  recordId?: string;
  /** Task ActivityDate, 'YYYY-MM-DD'. */
  dueDate?: string;
  /** Event start, ISO-8601. Defaults server-side to now + 1h. */
  activityDateTime?: string;
  /** Event length in minutes (default 30). */
  durationMinutes?: number;
  priority?: string;
  status?: string;
  /** Email recipient (required when action === 'email'). */
  toAddress?: string;
  /** Email HTML body. */
  htmlBody?: string;
}

export interface CrmWriteResult {
  success: boolean;
  /** New record Id (null for email). */
  id: string | null;
}

/**
 * Perform a CRM write through the Apex bridge. Throws on validation / server
 * error so the calling modal can surface the message; resolves with the new
 * record Id on success.
 */
export async function crmWrite(input: CrmWriteInput): Promise<CrmWriteResult> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  const res = await sdk.fetch('/services/apexrest/crm/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { success?: boolean; id?: string | null; error?: string };
  if (!res.ok || json.success === false) {
    throw new Error(json?.error ?? `CRM write failed (HTTP ${res.status})`);
  }
  return { success: true, id: json.id ?? null };
}
