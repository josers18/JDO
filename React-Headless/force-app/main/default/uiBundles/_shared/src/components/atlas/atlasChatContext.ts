import type { AgentforceContextVariable } from '@salesforce/agentforce-conversation-client';

const objectNames: Record<string, string> = {
  '001': 'Account', '003': 'Contact', '006': 'Opportunity', '00Q': 'Lead',
  '00T': 'Task', '00U': 'Event', '500': 'Case',
};
export function recordObject(id: string | null | undefined) {
  return id && /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id) ? objectNames[id.slice(0, 3)] : undefined;
}
export function chatContext(app: string, path: string, search: string, inspected: string) {
  const params = new URLSearchParams(search);
  const accountPath = path.match(/^\/client\/([^/]+)\/?$/)?.[1];
  const candidates = [accountPath, params.get('client'), params.get('deal'), params.get('record'), params.get('lead'), inspected, params.get('account'), params.get('reviewAccount')];
  const record = candidates.find(id => recordObject(id)) ?? null;
  const values: Record<string, string | null> = {
    currentAppName: app, currentPageType: record ? 'record' : path === '/' ? 'home' : 'list',
    currentRecordId: record, currentObjectApiName: recordObject(record) ?? null,
  };
  return Object.entries(values).map(([name, value]): AgentforceContextVariable => ({ name, value, type: 'Text' }));
}
