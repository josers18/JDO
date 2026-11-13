/* Shared dispatch regression, with explicit test doubles rather than source captures. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
 const page=await browser.newPage({viewport:{width:1512,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const install=(name,persona)=>Object.defineProperty(window,name,{get:()=>api=>{
   window.__integrationApi=window.__integrationApi||{};window.__integrationApi[persona]=api;
   return {
    accounts:()=>[{Id:'001TEST_'+persona,Name:'Synthetic integration fixture'}],
    render:page=>page==='today'?`<h1 data-integration-persona="${persona}">Independent ${persona} desk</h1>`:null,
    relationship:(tab,a)=>a.Id==='001TEST_'+persona?`<div data-integration-account="${a.Id}">${tab}</div>`:null,
    historyFor:()=>[],
    recordFor:(kind,id)=>id==='00T_TEST'?{Id:id,Subject:'Synthetic source task'}:null,
    prepareDraft:(kind,data)=>({...data,integrationPrepared:Number(data.integrationPrepared||0)+1}),
    openForm:(kind)=>{if(kind!=='test-only')return false;api.modal('Handled form','<p data-integration-form>Handled by persona</p>');return true;},
    editDraft:d=>{api.modal('Handled editor',`<p data-integration-editor>${d.id}</p>`);return true;}
   };
  },set:()=>{}});
  install('createWealthAtlas','wealth');install('createCommercialAtlas','commercial');
 });
 const base=process.env.STUDY_URL||'http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html';
 for(const persona of ['wealth','commercial']){
  await page.goto(base+'?'+new URLSearchParams({direction:'atlas',persona,page:'today'}));
  assert.equal(await page.locator('[data-integration-persona]').getAttribute('data-integration-persona'),persona);
  assert(await page.evaluate(p=>window.__integrationApi[p].accounts().some(a=>a.Id==='001TEST_'+p),persona));
  const result=await page.evaluate(p=>{const api=window.__integrationApi[p];return {history:api.historyFor(api.baseOffers()[0]||{account:'unknown',code:'unknown'}),source:api.recordFor('task','00T_TEST')?.Id};},persona);
  assert.deepEqual(result,{history:[],source:'00T_TEST'});
  await page.evaluate(p=>window.__integrationApi[p].openForm('test-only'),persona);
  assert.equal(await page.locator('[data-integration-form]').count(),1);await page.keyboard.press('Escape');
  await page.evaluate(p=>window.__integrationApi[p].openBaseForm('task','Synthetic integration fixture',null,{accountId:'001TEST_'+p,sourceAccountId:'001TEST_'+p,sourceKey:'source-test',provenance:{source:'test-only'}}),persona);
  await page.locator('[name="title"]').fill('Synthetic test proposal');
  await page.getByRole('button',{name:/Keep local draft/}).click();
  let draft=await page.evaluate(p=>JSON.parse(sessionStorage.getItem('cumulus.complete.drafts')).find(d=>d.persona===p),persona);
  assert.equal(draft.integrationPrepared,1);assert.equal(draft.sourceKey,'source-test');assert.equal(draft.accountId,'001TEST_'+persona);
  assert.deepEqual(JSON.parse(draft.provenance),{source:'test-only'});
  await page.evaluate(({p,id})=>window.__integrationApi[p].updateDraft(id,{notes:'Edited'}),{p:persona,id:draft.id});
  draft=await page.evaluate(p=>JSON.parse(sessionStorage.getItem('cumulus.complete.drafts')).find(d=>d.persona===p),persona);
  assert.equal(draft.integrationPrepared,2);assert.equal(draft.actionReviewed,false);
  await page.evaluate(p=>{const api=window.__integrationApi[p];api.saveDraft('meeting',{title:'Source Event update proposal',date:'2026-11-12T09:00',sourceRecordId:'00U_TEST',sourceKind:'Event',operation:'update-proposal'});api.saveDraft('meeting',{title:'New meeting proposal',date:'2026-11-12T10:00'});api.navigate({page:'work',sub:'meetings'});},persona);
  assert((await page.locator('.wc-day-agenda').innerText()).includes('New meeting proposal'));
  assert(!(await page.locator('.wc-day-agenda').innerText()).includes('Source Event update proposal'));
  await page.evaluate(p=>window.__integrationApi[p].navigate({page:'work',sub:'drafts'}),persona);
  await page.getByRole('button',{name:'Edit local draft',exact:true}).click();
  assert.equal(await page.locator('[data-integration-editor]').count(),1);await page.keyboard.press('Escape');
  await page.goto(base+'?'+new URLSearchParams({direction:'atlas',persona,page:'relationships',client:'001TEST_'+persona,tab:'overview'}));
  assert.equal(await page.locator('[data-integration-account]').getAttribute('data-integration-account'),'001TEST_'+persona);
 }
 await page.goto(base+'?direction=atlas&persona=retail&page=today');
 assert.equal(await page.locator('[data-integration-persona]').count(),0);
 await page.goto(base+'?direction=panorama&persona=wealth&page=today');
 assert.equal(await page.locator('[data-integration-persona]').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Passed independent Atlas dispatch, exact-account merging, empty-history isolation, source lookup, delegated forms and save/edit preparation; Retail/earlier styles isolated.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
