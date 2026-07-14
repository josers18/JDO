import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleDetailModal, ToastProvider, type ScheduleItem } from '@shared';
import * as client from '@shared/data/crmWriteClient';

const taskItem: ScheduleItem = {
  id: 'b', recordId: '00T000000000001', sobjectType: 'Task',
  time: '2026-07-14', title: 'Today task', kind: 'task', status: 'Not Started', priority: 'Normal', bucket: 'today',
};
const mockItem: ScheduleItem = { id: 'm', time: '2026-07-14', title: 'Mock task', kind: 'task', bucket: 'today' };

describe('ScheduleDetailModal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders editable fields for a real record', () => {
    render(
      <ToastProvider>
        <ScheduleDetailModal open onClose={() => {}} item={taskItem} />
      </ToastProvider>,
    );
    expect(screen.getByDisplayValue('Today task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeEnabled();
  });

  it('submits an update with the edited fields', async () => {
    const spy = vi.spyOn(client, 'crmWrite').mockResolvedValue({ success: true, id: '00T000000000001' });
    const onSaved = vi.fn();
    render(
      <ToastProvider>
        <ScheduleDetailModal open onClose={() => {}} item={taskItem} onSaved={onSaved} />
      </ToastProvider>,
    );
    const subject = screen.getByDisplayValue('Today task');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Edited subject');
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.action).toBe('update');
    expect(arg.sobjectType).toBe('Task');
    expect(arg.recordId).toBe('00T000000000001');
    expect(arg.subject).toBe('Edited subject');
  });

  it('is read-only (Save disabled) when the item has no recordId', () => {
    render(
      <ToastProvider>
        <ScheduleDetailModal open onClose={() => {}} item={mockItem} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
  });

  it('renders nothing when item is null', () => {
    const { container } = render(<ScheduleDetailModal open onClose={() => {}} item={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
