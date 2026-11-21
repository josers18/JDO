import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { embedAgentforceClient } from '@salesforce/agentforce-conversation-client';
import { AgentforceChat } from '@shared/components/AgentforceChat';
import { chatContext } from '@shared/components/atlas/atlasChatContext';

vi.mock('@salesforce/agentforce-conversation-client', () => ({ embedAgentforceClient: vi.fn() }));

it('opens the native conversation directly and clears the previous record in that same embed', async () => {
  const frame = document.createElement('div');
  const setContext = vi.fn(async (vars: unknown[]) => ({ applied: vars.length }));
  vi.mocked(embedAgentforceClient).mockReturnValue({
    chatClientComponent: frame, loApp: document.createElement('div'), setContext,
  } as unknown as ReturnType<typeof embedAgentforceClient>);
  const first = chatContext('Retail', '/client/001000000000001AAA', '', '');
  const view = render(<AgentforceChat inline pageContext={first} />);
  await waitFor(() => expect(embedAgentforceClient).toHaveBeenCalledTimes(1));
  act(() => { frame.dispatchEvent(new Event('accready')); });
  expect(await screen.findByText('Workspace context shared')).not.toBeVisible();
  view.rerender(<AgentforceChat inline detailsOpen pageContext={first} />);
  expect(screen.getByText('Workspace context shared')).toBeVisible();
  expect(setContext).toHaveBeenCalledWith(first, { awaitApplied: true });
  const next = chatContext('Retail', '/work', '', '');
  view.rerender(<AgentforceChat inline pageContext={next} />);
  await waitFor(() => expect(setContext).toHaveBeenLastCalledWith(next, { awaitApplied: true }));
  expect(next.find(v => v.name === 'currentRecordId')?.value).toBeNull();
  expect(embedAgentforceClient).toHaveBeenCalledTimes(1);
});
