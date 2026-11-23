/**
 * Compliance events for one account, derived by query rather than stored:
 * a new beneficial-owner edge, a screening change or hit, a headquarters
 * postal-code change, and identification documents that expire within 90 days
 * (or already have). Each source is read independently, so a failing source
 * drops only its own events. Detail text is vendor-neutral.
 */
import { queryDataCloud } from './dataCloudClient';
import { executeGraphQL } from './graphqlClient';
import { localDay, localIsoDate } from './localDate';

export interface ComplianceEvent {
  kind: 'ownership' | 'screening' | 'address' | 'document';
  /** YYYY-MM-DD */
  detected: string;
  detail: string;
}

const SF_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const DOC_WINDOW_DAYS = 90;
const DOC_LIMIT = 50;

type Row = Record<string, unknown>;
const asBool = (v: unknown) => v === true || v === 'true';

const ownershipSql = (acct: string) => `
  SELECT edge_discovered_date__c, dst_account_id__c
  FROM BT_Synth_Relationship_Graph__dlm
  WHERE edge_type__c = 'BUSINESS_OWNER' AND src_account_id__c = '${acct}'
    AND edge_discovered_date__c >= current_date - INTERVAL '180' DAY
  ORDER BY edge_discovered_date__c DESC
  LIMIT 5`;

const screeningSql = (acct: string) => `
  SELECT profile_date__c, change_since_last_run__c, overall_risk_rating__c,
         pep_hit__c, sanctions_hit__c, adverse_media_hit__c
  FROM BT_WorldCheck_AML__dlm
  WHERE account_id__c = '${acct}'
    AND (   change_since_last_run__c IN ('Changed', 'New')
         OR ((pep_hit__c = true OR sanctions_hit__c = true OR adverse_media_hit__c = true)
             AND profile_date__c = (SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm)))
    AND profile_date__c >= current_date - INTERVAL '180' DAY
  ORDER BY profile_date__c DESC
  LIMIT 5`;

const addressSql = (acct: string) => `
  SELECT profile_month__c, hq_postal_code__c
  FROM BT_Zoominfo_Firmographics__dlm
  WHERE account_id__c = '${acct}'
  ORDER BY profile_month__c DESC
  LIMIT 2`;

async function ownershipEvents(acct: string): Promise<ComplianceEvent[]> {
  const res = await queryDataCloud<Row>(ownershipSql(acct), 5);
  return res.rows.map(r => ({
    kind: 'ownership' as const,
    detected: localDay(r.edge_discovered_date__c),
    detail: 'New beneficial ownership relationship identified; confirm ownership documentation.',
  }));
}

async function screeningEvents(acct: string): Promise<ComplianceEvent[]> {
  const res = await queryDataCloud<Row>(screeningSql(acct), 5);
  return res.rows.map(r => {
    const flags = [asBool(r.pep_hit__c) && 'PEP match', asBool(r.sanctions_hit__c) && 'sanctions match', asBool(r.adverse_media_hit__c) && 'adverse media']
      .filter(Boolean).join(', ');
    // A hit flag repeats on every daily snapshot, so only the latest snapshot reports an unchanged hit.
    const change = r.change_since_last_run__c === 'New' ? 'First screening'
      : r.change_since_last_run__c === 'Changed' ? 'Screening result changed' : 'Open screening hit';
    return {
      kind: 'screening' as const,
      detected: localDay(r.profile_date__c),
      detail: `${change}: ${String(r.overall_risk_rating__c ?? 'unrated')} risk${flags ? ` (${flags})` : ''}.`,
    };
  });
}

async function addressEvents(acct: string): Promise<ComplianceEvent[]> {
  const res = await queryDataCloud<Row>(addressSql(acct), 2);
  const [latest, prior] = res.rows;
  const now = String(latest?.hq_postal_code__c ?? '');
  const was = String(prior?.hq_postal_code__c ?? '');
  if (!latest || !prior || !now || !was || now === was) return [];
  return [{
    kind: 'address',
    detected: localDay(latest.profile_month__c),
    detail: `Headquarters postal code changed from ${was} to ${now}; verify the address of record.`,
  }];
}

interface DocShape {
  uiapi?: { query?: { FinServ__IdentificationDocument__c?: { edges?: { node: {
    Id: string;
    FinServ__DocumentType__c?: { value?: string | null };
    FinServ__ExpirationDate__c?: { value?: string | null };
  } }[] } } };
}

async function documentEvents(acct: string): Promise<ComplianceEvent[]> {
  const data = await executeGraphQL<DocShape>(`query AccountIdDocuments {
  uiapi { query {
    FinServ__IdentificationDocument__c(first: ${DOC_LIMIT}, where: { FinServ__Account__c: { eq: "${acct}" } }) {
      edges { node { Id FinServ__DocumentType__c @optional { value } FinServ__ExpirationDate__c @optional { value } } }
    }
  } }
}`);
  const today = localIsoDate();
  const cutoff = localIsoDate(new Date(), DOC_WINDOW_DAYS);
  const out: ComplianceEvent[] = [];
  for (const { node } of data.uiapi?.query?.FinServ__IdentificationDocument__c?.edges ?? []) {
    const exp = node.FinServ__ExpirationDate__c?.value ? localDay(node.FinServ__ExpirationDate__c.value) : '';
    if (!exp || exp > cutoff) continue;
    const type = node.FinServ__DocumentType__c?.value || 'Identification document';
    out.push({
      kind: 'document',
      detected: exp,
      detail: exp < today ? `${type} expired on ${exp}; obtain a current document.` : `${type} expires on ${exp}; request a renewed document.`,
    });
  }
  return out;
}

/** The account's compliance events, newest first. A failing source is skipped. */
export async function fetchComplianceEvents(accountId: string): Promise<ComplianceEvent[]> {
  if (!SF_ID.test(accountId)) return [];
  const settled = await Promise.allSettled([
    ownershipEvents(accountId), screeningEvents(accountId), addressEvents(accountId), documentEvents(accountId),
  ]);
  return settled
    .flatMap(s => (s.status === 'fulfilled' ? s.value : []))
    .sort((a, b) => b.detected.localeCompare(a.detected));
}
