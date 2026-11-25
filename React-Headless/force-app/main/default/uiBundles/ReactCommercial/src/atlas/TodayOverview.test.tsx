import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { Today } from './TodayIntel';

it('places the three-measure Portfolio pulse on Overview between the hero and work panels', () => {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/']}><Today
    owner="005am000003PbFDAA0" ownerName="Allen Carter" followup={() => {}} saveBatch={() => {}} draft={() => {}}
  /></MemoryRouter>);
  const root = new DOMParser().parseFromString(html, 'text/html');
  const strip = root.querySelector('.ca-hero + .cr-pulse');
  expect(strip?.querySelector('h2')?.textContent).toBe('Portfolio pulse');
  expect(strip?.nextElementSibling?.classList.contains('ca-today-grid')).toBe(true);
  expect([...root.querySelectorAll('.cr-pulse-body > button > span:first-child')].map(s => s.textContent))
    .toEqual(['Growth-tier mix', 'Branch exposure', 'Open service cases']);
  expect(strip?.querySelector('header button')?.textContent).toContain('Read book briefing');
});
