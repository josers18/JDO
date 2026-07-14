import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleTable, tagSchedule, type ScheduleItem } from '@shared';

const TODAY = '2026-07-14';
const items: ScheduleItem[] = tagSchedule([
  { id: 'a', time: '2026-07-10', title: 'Overdue call', kind: 'call', clientName: 'Acme' },
  { id: 'b', time: '2026-07-14', title: 'Today task', kind: 'task', priority: 'High' },
  { id: 'c', time: '2026-07-20', title: 'Future meeting', kind: 'meeting' },
], TODAY);

describe('ScheduleTable', () => {
  it('shows all rows under the All filter', () => {
    render(<ScheduleTable items={items} onOpen={() => {}} />);
    expect(screen.getByText('Overdue call')).toBeInTheDocument();
    expect(screen.getByText('Today task')).toBeInTheDocument();
    expect(screen.getByText('Future meeting')).toBeInTheDocument();
  });

  it('filters to a single bucket when its chip is clicked', async () => {
    render(<ScheduleTable items={items} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Overdue/ }));
    expect(screen.getByText('Overdue call')).toBeInTheDocument();
    expect(screen.queryByText('Today task')).not.toBeInTheDocument();
  });

  it('filters by kind (Meetings hides pure tasks)', async () => {
    render(<ScheduleTable items={items} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Meetings/ }));
    expect(screen.getByText('Future meeting')).toBeInTheDocument();
    expect(screen.getByText('Overdue call')).toBeInTheDocument(); // 'call' counts as a meeting
    expect(screen.queryByText('Today task')).not.toBeInTheDocument();
  });

  it('shows an empty state when a filter matches nothing', async () => {
    const overdueOnly = tagSchedule([{ id: 'x', time: '2026-07-01', title: 'Old', kind: 'task' }], TODAY);
    render(<ScheduleTable items={overdueOnly} onOpen={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Today/ }));
    expect(screen.getByText(/Nothing/i)).toBeInTheDocument();
  });

  it('calls onOpen with the clicked item', async () => {
    const onOpen = vi.fn();
    render(<ScheduleTable items={items} onOpen={onOpen} />);
    await userEvent.click(screen.getByText('Today task'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('b');
  });
});
