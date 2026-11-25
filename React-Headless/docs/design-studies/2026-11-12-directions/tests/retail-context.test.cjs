const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {};
vm.createContext(context);
for (const file of ['workspace-data.js', 'workspace-dc.js', 'retail-data.js', 'retail-cohort-data.js', 'retail-context.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const select = vm.runInContext(`createRetailContext({
 ownerId:retailCohortData.ownerId,
 accountIds:[...workspaceCapture.accounts.filter(a=>a.OwnerId===retailCohortData.ownerId).map(a=>a.Id),...retailCohortData.profiles.map(r=>r.account),...retailData.datasets.heatmap.map(r=>r.account)],
 offerSources:[{rows:workspaceDC.datasets.offers,label:'Original eligibility capture'},
 {rows:retailCohortData.offers,label:'Cohort eligibility capture'},
 {rows:retailData.datasets.heatmap,label:'Selected eligibility capture'}],
 holdingSources:[{rows:retailCohortData.holdings,label:'Captured CRM holdings'},
 {rows:retailData.datasets.holdings,label:'Captured CRM holdings'}]
})`, context);
const owner = '005am000003PbFAAA0', kyle = '001am00002A8XjIAAV';
test('Kyle offers remain available outside Growth and cohort state', () => {
  assert.equal(select.offersForAccount(kyle, owner).length, 6);
  assert(select.offersForAccount(kyle, owner).some(r => r.code === 'HEL-ACQ'));
});
test('deduplicates account/product and retains original capture precedence', () => {
  const original = vm.runInContext(`workspaceDC.datasets.offers.find(r=>r.account==='${kyle}'&&r.code==='HEL-ACQ')`,context);
  const rows = select.offersForAccount(kyle,owner);
  assert.equal(rows.filter(r=>r.code==='HEL-ACQ').length,1);
  assert.equal(rows.find(r=>r.code==='HEL-ACQ').probability,original.probability);
});
test('unknown accounts and other owners do not inherit captured evidence', () => {
  assert.equal(select.offersForAccount('unknown',owner).length,0);
  assert.equal(select.offersForAccount('001am00000qvjsAAAQ',owner).length,0);
  assert.equal(select.offersForAccount(kyle,'different-owner').length,0);
  assert.equal(select.holdingsForAccount(kyle,'different-owner').length,0);
});
test('another Retail customer receives only their own rows', () => {
  const id = vm.runInContext('retailCohortData.offers[0].account',context);
  assert(select.offersForAccount(id,owner).length>0);
  assert(select.offersForAccount(id,owner).every(r=>r.account===id));
});
test('known holdings retain source status without inventing balances', () => {
  const id = vm.runInContext('retailCohortData.holdings[0].account',context);
  const rows = select.holdingsForAccount(id,owner);
  assert(rows.length>0);
  assert(rows.every(r=>r.account===id && r.balance == null));
});
test('selection does not mutate captured source rows', () => {
  const before=vm.runInContext('JSON.stringify(retailCohortData)',context);
  select.offersForAccount(kyle,owner);select.holdingsForAccount(kyle,owner);
  assert.equal(vm.runInContext('JSON.stringify(retailCohortData)',context),before);
});
