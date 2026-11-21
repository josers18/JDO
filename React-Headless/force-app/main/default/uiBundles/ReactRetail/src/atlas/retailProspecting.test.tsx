import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@shared/components/Toast';
import { Prospecting } from './retailRelationships';
import { RetailActions } from './retailUi';
import Workbench from './retailWorkbench';

const actor = '005000000000001';
const owner = '005000000000002';
const otherLead = '00Q000000000001';
const exactLead = '00Q000000000002';

vi.mock('./retailData', async importOriginal => {
  const source = await importOriginal<typeof import('./retailData')>();
  return {
    ...source,
    readBook: vi.fn(async (object: string, _owner: string, options?: { record?: string }) => {
      const rows = object === 'Lead' ? [
        { Id: otherLead, Name: { value: 'Another Lead' }, Email: { value: 'another@example.test' } },
        { Id: exactLead, Name: { value: 'Selected Lead' }, Email: { value: 'selected@example.test' } },
      ].filter(row => !options?.record || row.Id === options.record) : [];
      return { rows, totalCount: rows.length, next: null };
    }),
  };
});

function renderWorkspace(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <ToastProvider>
      <RetailActions actor={actor} owner={owner}>
        <Routes>
          <Route path="/prospecting" element={<Prospecting ownerId={owner} />} />
          <Route path="/work" element={<Workbench ownerId={owner} />} />
        </Routes>
      </RetailActions>
    </ToastProvider>
  </MemoryRouter>);
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

it('opens an unsent draft for the selected Lead and restores it in Workbench', async () => {
  const workspace = renderWorkspace(`/prospecting?lead=${exactLead}`);
  fireEvent.change(await screen.findByLabelText('Prepare the next contact'), { target: { value: 'Offer a call next week.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Draft email' }));

  const dialog = within(screen.getByRole('dialog', { name: 'Draft email' }));
  expect(dialog.getByText('selected@example.test')).toBeInTheDocument();
  expect(dialog.queryByText('another@example.test')).not.toBeInTheDocument();
  expect(dialog.getByLabelText('Body')).toHaveValue('Offer a call next week.');
  fireEvent.change(dialog.getByLabelText('Subject'), { target: { value: 'Availability next week' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Keep email draft' }));

  const link = screen.getByRole('link', { name: 'Open email draft' }).getAttribute('href');
  expect(link).toContain(exactLead);
  workspace.unmount();
  renderWorkspace(link ?? '/work?view=drafts');

  expect(screen.getByRole('heading', { name: 'Availability next week' })).toBeInTheDocument();
  expect(screen.getByText('selected@example.test')).toBeInTheDocument();
  expect(screen.getByLabelText('Email body')).toHaveValue('Offer a call next week.');
  expect(screen.getByRole('link', { name: 'Open prospect' })).toHaveAttribute('href', `/prospecting?lead=${exactLead}`);
});
