import { crmWrite, type CrmWriteInput } from '@shared/data/crmWriteClient';
import { availableProductLabel, WHITESPACE_LEAD_SOURCE, whitespaceOpportunityName } from '@shared/data/whitespace';
import { verifyHousehold, fetchProductEligibility } from './wealthHouseholdData';
import { stringField } from './wealthAtlasData';
import type { Proposal } from './WealthProposals';

export function submissionLabel(kind: string) {
  if (kind.endsWith(' · Cancel')) return 'Cancel meeting in Salesforce';
  if (kind.endsWith(' · Delete')) return 'Delete task in Salesforce';
  return ['Goal', 'Life event', 'Opportunity', 'Lead', 'Task', 'Meeting'].includes(kind.split(' · ')[0])
    ? 'Submit to Salesforce' : null;
}

export async function submitWealthProposal(p: Proposal, ownerId: string) {
  const [kind, operation] = p.kind.split(' · ');
  const d = p.details ?? {};
  const source = p.sourceId || '';
  const amount = (v?: string) => v?.trim() ? Number(v) : undefined;
  const base = { requestId: p.id, description: p.description };
  let body: CrmWriteInput;
  if (kind === 'Opportunity') {
    const code = d.ProductCode || d.Type;
    const account = await verifyHousehold(ownerId, p.accountId || '');
    if (!account) throw new Error('The household is unavailable in this book.');
    const [label, offers] = await Promise.all([availableProductLabel('wealth', account.Id, code), fetchProductEligibility(account.Id)]);
    if (offers.error) throw new Error('Eligibility is unavailable. Retry when Data 360 is available.');
    if (!offers.rows.some(row => row.code === code)) throw new Error('The product no longer has verified eligibility. Review the heat map.');
    if (!d.Amount?.trim() || !Number.isFinite(Number(d.Amount)) || Number(d.Amount) < 0)
      throw new Error('Enter the reviewed opportunity amount before submitting.');
    body = { action: 'opportunity', name: whitespaceOpportunityName(label, stringField(account, 'Name')), accountId: account.Id,
      ownerId, amount: amount(d.Amount), closeDate: p.date || undefined, leadSource: WHITESPACE_LEAD_SOURCE };
  } else if (kind === 'Goal') {
    if (!/^13[QR]/.test(source)) throw new Error('Open a financial plan or an existing goal to submit this proposal.');
    body = { ...(source.startsWith('13Q') ? {action: 'goal' as const, financialPlanId: source} : {action: 'update' as const, sobjectType: 'FinancialGoal' as const, recordId: source}),
      name: p.title, type: d.Type || undefined, status: d.Status || undefined, priority: d.Priority || undefined,
      targetDate: p.date || undefined, targetAmount: amount(d.TargetAmount), actualAmount: amount(d.ActualAmount) };
  } else if (kind === 'Life event') {
    if (!/^(003|0Yr)/.test(source)) throw new Error('Select a primary contact or an existing life event.');
    body = { ...(source.startsWith('003') ? {action:'lifeEvent' as const, primaryPersonId:source} : {action:'update' as const, sobjectType:'PersonLifeEvent' as const, recordId:source}),
      name:p.title, eventType:d.EventType, eventDate:p.date };
  } else if (kind === 'Lead') {
    body = { ...(source.startsWith('00Q') ? {action:'update' as const, recordId:source, sobjectType:'Lead' as const} : {action:'lead' as const, ownerId}),
      firstName:d.FirstName, lastName:d.LastName, company:d.Company, email:d.Email, status:d.Status || undefined };
  } else if (kind === 'Task' || kind === 'Meeting') {
    const meeting = kind === 'Meeting';
    if (operation && !source.startsWith(meeting ? '00U' : '00T')) throw new Error('Select the original Salesforce activity.');
    if (operation === 'Delete' || operation === 'Cancel') body = { action:'delete', recordId:source, sobjectType:meeting ? 'Event' : 'Task' };
    else {
      if (meeting && (!p.date || !d.StartTime)) throw new Error('Enter the meeting date and local start time.');
      body = { ...(operation ? {action:'update' as const, recordId:source, sobjectType:meeting ? 'Event' as const : 'Task' as const}
        : {action:meeting ? 'event' as const : 'task' as const, ownerId, whatId:p.accountId || undefined}),
        subject:p.title, ...(meeting ? { location:d.Location, activityDateTime:new Date(p.date+'T'+d.StartTime).toISOString() }
          : { dueDate:p.date || undefined, priority:d.Priority || undefined, status:operation === 'Complete' ? 'Completed' : d.Status || undefined }) };
    }
  } else throw new Error('This proposal is kept in the local workbench.');
  return crmWrite({...base, ...body});
}
