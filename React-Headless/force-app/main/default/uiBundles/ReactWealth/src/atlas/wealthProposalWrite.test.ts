import { describe, expect, it, vi } from 'vitest';
import { crmWrite } from '@shared/data/crmWriteClient';
import { fetchProductEligibility } from './wealthHouseholdData';
import type { Proposal } from './WealthProposals';
import { submitWealthProposal } from './wealthProposalWrite';

vi.mock('@shared/data/crmWriteClient', () => ({crmWrite:vi.fn(async () => ({success:true,id:'record'}))}));
vi.mock('./wealthHouseholdData', () => ({
  verifyHousehold:vi.fn(async () => ({Id:'account', Name:{value:'Selected household'}})),
  fetchProductEligibility:vi.fn(async () => ({error:false,rows:[{code:'WM-MAS'}]})),
}));
vi.mock('@shared/data/whitespace', async original => ({
  ...await original<typeof import('@shared/data/whitespace')>(), availableProductLabel:vi.fn(async () => 'Managed Account'),
}));
const draft: Proposal = {id:crypto.randomUUID(),kind:'Opportunity',title:'Reviewed proposal',accountId:'account',
  date:'2026-12-02',description:'Approved follow-up',details:{ProductCode:'WM-MAS',Amount:'1250',StartTime:'09:30'}};

describe('reviewed Salesforce proposals', () => {
  it('preserves the grid attribution, scoped owner, product, amount and stable submission key', async () => {
    await submitWealthProposal(draft,'owner');
    expect(crmWrite).toHaveBeenLastCalledWith(expect.objectContaining({requestId:draft.id, ownerId:'owner',accountId:'account',
      action:'opportunity', name:'Managed Account — Selected household',amount:1250,leadSource:'Cross-sell grid'}));
  });
  it('rejects withdrawn eligibility before writing', async () => {
    vi.mocked(fetchProductEligibility).mockResolvedValueOnce({error:false,rows:[]});
    vi.mocked(crmWrite).mockClear();
    await expect(submitWealthProposal(draft,'owner')).rejects.toThrow(/eligibility/);
    expect(crmWrite).not.toHaveBeenCalled();
  });
  it.each([
    ['Goal','13Qplan','goal','financialPlanId'], ['Goal','13Rgoal','update','recordId'],
    ['Life event','003person','lifeEvent','primaryPersonId'], ['Life event','0Yrmoment','update','recordId'],
    ['Task · Complete','00Ttask','update','recordId'], ['Meeting · Edit','00Uevent','update','recordId'],
    ['Meeting · Cancel','00Uevent','delete','recordId'], ['Lead','00Qlead','update','recordId'],
  ])('routes %s from %s to the correct source', async (kind,sourceId,action,field) => {
    await submitWealthProposal({...draft,kind,sourceId},'owner');
    expect(crmWrite).toHaveBeenLastCalledWith(expect.objectContaining({action,[field]:sourceId,requestId:draft.id}));
  });
});
