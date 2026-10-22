/**
 * S7 — open service drag: ServiceNow cases (`ssot__Case__dlm`, data source
 * `Service_Now`) added to the CRM open-case count on the Cases KPI.
 *
 * ServiceNow statuses are lowercase `open` / `in_progress` / `closed` and
 * `ssot__IsClosed__c` is null, so open = status. ⚠ Verified live 2026-10-22: the
 * 4,009 ServiceNow cases are keyed by synthetic `account_id_<n>` ids that match
 * no Account. Only 6 rows (one account) carry a local `001am…` id, and the
 * newest case is 2025-02-13. So book counts are ~0 until the source is re-keyed. Unlike
 * the other DC signals this one never falls back to org-wide: adding 2,687
 * unscoped cases to a banker's KPI would overstate their book.
 */
import { bookAccountFilter, queryDataCloud, type BookScope } from './dataCloudClient';

const serviceNowSql = (accountFilter: string) => `
  SELECT COUNT(*) AS open_n,
         SUM(CASE WHEN ssot__CreatedDate__c < current_date - INTERVAL '30' DAY THEN 1 ELSE 0 END) AS aged_n
  FROM ssot__Case__dlm
  WHERE ssot__DataSourceId__c = 'Service_Now'
    AND ssot__CaseStatusId__c IN ('open', 'in_progress')
    AND ssot__AccountId__c ${accountFilter}
`;

export interface ServiceNowDrag {
  open: number;
  /** Open more than 30 days. */
  aged: number;
  scope: BookScope;
}

/** S7 — open ServiceNow cases on the banker's book (never widened to the org). */
export async function fetchServiceNowDrag(ownerId: string | null | undefined): Promise<ServiceNowDrag> {
  const { accountFilter, scope } = bookAccountFilter(ownerId);
  const res = await queryDataCloud<Record<string, unknown>>(serviceNowSql(accountFilter), 1);
  const r = res.rows[0] ?? {};
  // DC returns numbers as strings.
  return { open: Number(r.open_n) || 0, aged: Number(r.aged_n) || 0, scope };
}
