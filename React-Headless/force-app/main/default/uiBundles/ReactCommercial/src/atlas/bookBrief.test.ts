import { beforeEach, expect, it, vi } from 'vitest';
import { generateText } from '@shared';
import { generateBookBrief } from './bookBrief';

vi.mock('@shared', () => ({
  generateText: vi.fn(),
  loadCenterConfig: async () => ({ models: { freeform: '' }, params: {} }),
}));

const context = 'Pipeline $18.9B. Weekly net -$116.9K.';
const introduction = 'Review recorded activity and confirm the next step with the relationship owner. '.repeat(8);

beforeEach(() => vi.clearAllMocks());

it('renders the signed and scaled amounts from the supplied evidence', async () => {
  vi.mocked(generateText).mockResolvedValue({ source: 'model', text: introduction + 'Net [[amount_2]], pipeline [[amount_1]].' });
  await expect(generateBookBrief(context)).resolves.toContain('Net -$116.9K, pipeline $18.9B.');
  expect(vi.mocked(generateText).mock.calls[0][0].context).toBe('Pipeline [[amount_1]]. Weekly net [[amount_2]].');
});

it.each(['-$116.9M', '[[amount_3]]'])('rejects a monetary figure absent from the evidence (%s)', async figure => {
  vi.mocked(generateText).mockResolvedValue({ source: 'model', text: introduction + figure });
  await expect(generateBookBrief(context)).rejects.toThrow(/monetary figure/);
});
