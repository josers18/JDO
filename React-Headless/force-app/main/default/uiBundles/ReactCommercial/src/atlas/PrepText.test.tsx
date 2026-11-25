import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PrepText } from './TodayIntel';

it('renders **bold** labels from the Agentforce preparation as <strong>, with no raw asterisks', () => {
  const html = renderToStaticMarkup(<PrepText text={'**Question:** How will you use the funds?  \n\n**Next Step:** Offer a follow-up.'} />);
  const root = new DOMParser().parseFromString(html, 'text/html');
  expect([...root.querySelectorAll('strong')].map(s => s.textContent)).toEqual(['Question:', 'Next Step:']);
  expect(root.body.textContent).not.toContain('*');
  expect(root.body.textContent).toContain('How will you use the funds?');
});
