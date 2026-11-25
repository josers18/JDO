import { createDataSDK } from '@salesforce/platform-sdk';
import type { PersonaKey } from '../theme/themes';

export interface EmployeeAgent { id: string; label: string }
export interface AgentDirectory { agents: EmployeeAgent[]; selected: string[]; canEdit: boolean }

export async function agentDirectory(center: PersonaKey, agentIds?: string[]): Promise<AgentDirectory> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) throw new Error('Salesforce is unavailable.');
  const path = '/services/apexrest/config/agents';
  const response = agentIds === undefined
    ? await sdk.fetch(path + '?center=' + center)
    : await sdk.fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ center, agentIds }),
      });
  const result = await response.json();
  if (!response.ok || !Array.isArray(result.agents) || !Array.isArray(result.selected))
    throw new Error(result.error || 'Could not load employee agents.');
  return result;
}
