/**
 * CRM write path for React UI bundles.
 *
 * WHY REST (same constraint as promptClient / DcBridgeRest): a Multi-Framework
 * UI bundle's app-domain session cannot call @AuraEnabled Apex or the generic
 * record/write REST APIs — only /services/apexrest/* is reachable via the SDK
 * fetch() path. So writes go through the custom `CrmWriteRest` Apex resource,
 * which performs the DML (Task / Event / Case / FinancialGoal) or sends the
 * email server-side.
 *
 *   POST /services/apexrest/crm/write
 *     body: { action, subject, description?, whoId?, whatId?, accountId?,
 *             dueDate?, activityDateTime?, durationMinutes?, priority?,
 *             status?, toAddress?, htmlBody? }
 *     200:  { success: true, id: "<recordId | null>" }
 *     4xx/5xx: { success: false, error: "message" }
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export type CrmAction = 'task' | 'event' | 'case' | 'email' | 'update' | 'delete' | 'goal' | 'lifeEvent' | 'lead';

export interface CrmWriteInput {
  action: CrmAction;
  /** Required for every action except 'update' edits that don't touch it. */
  subject?: string;
  description?: string;
  /** Contact/Lead the activity is about (Task/Event). */
  whoId?: string;
  /** Related record the activity is on (Task/Event) — Related To. */
  whatId?: string;
  /** Owner (Assigned To) — reassign a Task/Event on update. */
  ownerId?: string;
  /** Account for a Case. */
  accountId?: string;
  /** SObject to update/delete (required when action === 'update' | 'delete'). */
  sobjectType?: 'Task' | 'Event' | 'FinancialGoal' | 'PersonLifeEvent' | 'Lead';
  /** Id of the record to update/delete (required when action === 'update' | 'delete'). */
  recordId?: string;
  /** Task/Event Type picklist value, or FinancialGoal.Type. */
  type?: string;
  /** Event location (text). */
  location?: string;
  /** Event ShowAs (Busy | OutOfOffice | Free). */
  showAs?: string;
  /** FinancialGoal.Name (customer goal edit/create). */
  name?: string;
  /** FinancialPlan the new goal attributes to (required when action === 'goal').
   *  A FinancialGoal has no Account field — the plan is the customer link. */
  financialPlanId?: string;
  /** FinancialGoal.TargetDate, 'YYYY-MM-DD'. */
  targetDate?: string;
  /** FinancialGoal.TargetAmount. */
  targetAmount?: number;
  /** FinancialGoal.ActualAmount (amount saved so far). */
  actualAmount?: number;
  /** PersonLifeEvent.PrimaryPersonId — the Contact (person) the life event is
   *  about (required when action === 'lifeEvent'). A PersonLifeEvent has no
   *  Account field; the primary person Contact is the customer link. */
  primaryPersonId?: string;
  /** PersonLifeEvent.EventType picklist (Birth | Graduation | Job | …). */
  eventType?: string;
  /** PersonLifeEvent.EventDate, 'YYYY-MM-DD' (datetime field, anchored to midnight server-side). */
  eventDate?: string;
  /** Lead.LastName — the editable surname (required when action === 'lead').
   *  Lead.Name is a compound read-only field, so name edits go through
   *  firstName / lastName. */
  lastName?: string;
  /** Lead.FirstName. */
  firstName?: string;
  /** Lead.Company (required when action === 'lead'). */
  company?: string;
  /** Lead.LeadSource picklist (Website | Referral | Partner | …). */
  leadSource?: string;
  /** Lead.Email — also the recipient for the "email this lead" action. */
  email?: string;
  /** Lead.AnnualRevenue — the lead's estimated value. */
  annualRevenue?: number;
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

/** Identity of the logged-in Salesforce user (the session the bundle runs as). */
export interface CurrentUser {
  userId: string;
  /** Full display name, e.g. "Jane Banker". */
  name: string;
  firstName: string;
  lastName: string;
}

/**
 * Read the running user from the Apex bridge (`GET /crm/whoami`, backed by
 * `UserInfo`). Lets the banker home greet the logged-in user by name instead of
 * a hardcoded placeholder. Returns `null` on any failure (unavailable fetch
 * surface, non-OK response) so callers can fall back to a default name without a
 * try/catch — the greeting must never break the page.
 */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const sdk = await createDataSDK();
    if (!sdk.fetch) return null;
    const res = await sdk.fetch('/services/apexrest/crm/whoami', { method: 'GET' });
    const json = (await res.json()) as Partial<CurrentUser> & { success?: boolean };
    if (!res.ok || json.success === false || !json.userId) return null;
    return {
      userId: json.userId,
      name: json.name ?? '',
      firstName: json.firstName ?? '',
      lastName: json.lastName ?? '',
    };
  } catch {
    return null;
  }
}
