import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AtlasActionReview } from '@shared/components/atlas/AtlasActionReview';
import { crmWrite } from '@shared/data/crmWriteClient';
vi.mock('@shared/data/crmWriteClient', () => ({crmWrite:vi.fn()}));
vi.mock('@shared/data/accountLookup', () => ({fetchAccountEmail:vi.fn(async () => 'banker@example.com')}));
afterEach(cleanup);

it.each([
  ['task','Create task',{action:'task',whatId:'account',ownerId:'owner'}],
  ['case','Create case',{action:'case',accountId:'account'}],
  ['call','Log completed call',{action:'task',type:'Call',status:'Completed',whatId:'account'}],
  ['email','Send email',{action:'email',toAddress:'banker@example.com'}],
] as const)('reviews and retries the %s action with the original submission key',async (kind,label,payload) => {
  vi.mocked(crmWrite).mockReset().mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce({success:true,id:null});
  render(<AtlasActionReview accountId="account" ownerId="owner" name="Selected customer" subject="Follow up" note="Source note" />);
  fireEvent.click(screen.getByRole('button',{name:'Review recommended action'}));
  fireEvent.change(screen.getByLabelText('Action'),{target:{value:kind}});
  if (kind === 'email') await screen.findByDisplayValue('banker@example.com');
  expect(crmWrite).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:label}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  fireEvent.click(screen.getByRole('button',{name:label}));
  await screen.findByRole('status');
  expect(crmWrite).toHaveBeenCalledTimes(2);
  const [first,second]=vi.mocked(crmWrite).mock.calls;
  expect(second[0]).toEqual(first[0]);
  expect(second[0]).toMatchObject({...payload,requestId:expect.any(String)});
});
