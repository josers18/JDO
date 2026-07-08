import { render, screen } from '@testing-library/react';
import { Eyebrow, Pill } from '@shared';

describe('Eyebrow', () => {
  it('renders its text uppercased-by-css and applies tracking class', () => {
    const { container } = render(<Eyebrow>Total VDPs</Eyebrow>);
    const el = screen.getByText('Total VDPs');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('tracking-[0.14em]');
    expect(el.className).toContain('uppercase');
  });
});

describe('Pill', () => {
  it('maps the risk tone to risk classes', () => {
    render(<Pill tone="risk">needs outreach</Pill>);
    const el = screen.getByText('needs outreach');
    expect(el.className).toContain('bg-risk-bg');
    expect(el.className).toContain('text-risk');
  });
  it('defaults to the neutral tone', () => {
    render(<Pill>unknown</Pill>);
    expect(screen.getByText('unknown').className).toContain('text-muted');
  });
});
