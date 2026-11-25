import { describe, expect, it } from 'vitest';
import { chatContext } from '@shared/components/atlas/atlasChatContext';

const opportunity = '006000000000001AAA';
const account = '001000000000002AAA';
function values(path: string, query: string, selected = '') {
  return Object.fromEntries(chatContext('Cumulus', path, query, selected)
    .map(variable => [variable.name, variable.value]));
}
describe('Agentforce workspace context', () => {
  it('identifies the selected opportunity', () => {
    expect(values('/pipeline', '', opportunity)).toMatchObject({
      currentRecordId: opportunity, currentObjectApiName: 'Opportunity', currentPageType: 'record', currentAppName: 'Cumulus',
    });
  });
  it('prefers explicit navigation to an older selection', () => {
    expect(values('/pipeline', '?deal=' + opportunity, account).currentRecordId).toBe(opportunity);
  });
  it('clears record on returning to a workspace without a selection', () => {
    expect(values('/config', '?record=invalid')).toMatchObject({
      currentRecordId: null, currentObjectApiName: null, currentPageType: 'list',
    });
  });
});
