/* Run with PLAYWRIGHT_MODULE and CHROMIUM_PATH when Playwright is installed outside this study. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1512,height:1000}});
 page.setDefaultTimeout(8000);
 const errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url())});
 const base=process.env.STUDY_URL || 'http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html';
 const url=(params)=>base+'?'+new URLSearchParams({direction:'atlas',persona:'retail',...params});
 const kyle='001am00002A8XjIAAV';
 await page.goto(url({page:'growth'}));
 await page.locator('[data-r3="cohort"][data-value="Established Families"]').click();
 await page.locator('[data-studio-change="retail-offer"]').selectOption(kyle+':HEL-ACQ');
 await page.locator('.ps-need-conversation [data-action="model-evidence"]').click();
 await page.locator('dialog[open] [data-action="client"]').click();
 assert.equal(new URL(page.url()).searchParams.get('client'),kyle);
 await page.locator('[data-action="tab"][data-tab="growth"]').click();
 assert.equal(await page.locator('[data-customer-offers] option').count(),6);
 await page.locator('[data-rc-select]').selectOption('HEL-ACQ');
 assert((await page.locator('.rc-offer-focus').innerText()).includes('16.4'));
 assert((await page.locator('.rc-source-context').innerText()).includes('conversion points'));
 await page.locator('[data-rc="task"]').click();
 assert.equal(await page.locator('[name="accountId"]').inputValue(),kyle);
 assert.equal(await page.locator('[name="offerCode"]').inputValue(),'HEL-ACQ');
 await page.getByRole('button',{name:/Keep local draft/}).click();
 const drafts=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('cumulus.complete.drafts')));
 assert.equal(drafts[0].accountId,kyle);assert.equal(drafts[0].offerAccountId,kyle);assert.equal(drafts[0].offerCode,'HEL-ACQ');
 await page.locator('[data-action="nav"][data-page="growth"]').first().click();
 assert.equal(await page.locator('.r3-growth-context h2').innerText(),'Established Families');
 await page.goto(url({page:'work'}));
 await page.getByRole('button',{name:'Review local drafts'}).click();
 assert((await page.locator('body').innerText()).includes('Discuss HELOC with Kyle H Todd'));
 await page.getByRole('button',{name:'Edit local draft',exact:true}).click();
 const reassigned=await page.locator('#wc-draft-form [name="accountId"] option').evaluateAll(els=>els.map(e=>e.value).find(v=>v&&v!=='001am00002A8XjIAAV'));
 await page.locator('#wc-draft-form [name="accountId"]').selectOption(reassigned);
 await page.locator('#wc-draft-form button.primary').click();
 const changed=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('cumulus.complete.drafts'))[0]);
 assert.equal(changed.accountId,reassigned);assert.equal(changed.offerCode,undefined);assert.equal(changed.offerAccountId,undefined);
 await page.keyboard.press('Escape');
 await page.goto(url({page:'relationships',client:kyle,tab:'growth'}));
 await page.locator('[data-rc-select]').selectOption('HEL-ACQ');
 await page.locator('[data-rc="opportunity"]').click();
 assert.equal(await page.locator('[name="accountId"]').inputValue(),kyle);
 assert.equal(await page.locator('[name="offerCode"]').inputValue(),'HEL-ACQ');
 await page.keyboard.press('Escape');
 const other=await page.evaluate(()=>retailCohortData.holdings[0].account);
 const out=path.resolve('output/playwright/retail-context');fs.mkdirSync(out,{recursive:true});
 for(const width of [1512,768,390]){
  await page.setViewportSize({width,height:1000});
  for(const id of [kyle,other]){
   await page.goto(url({page:'relationships',client:id,tab:'growth'}));
   assert(await page.locator('[data-customer-offers]').count());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(id===kyle)await page.screenshot({path:path.join(out,'customer-offers-'+width+'.png'),fullPage:true});
  }
  await page.goto(url({page:'relationships',client:other,tab:'finances'}));
  assert((await page.locator('[data-customer-holdings]').innerText()).includes('Balance unavailable'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 for(const persona of ['wealth','commercial']){
  await page.goto(url({persona,page:'relationships',client:persona==='wealth'?'001am00000qvjsAAAQ':'001am00002AAAvtAAH',tab:'growth'}));
  assert.equal(await page.locator('[data-customer-offers]').count(),0);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log('Passed Growth → same-customer offers/history → exact-product draft → Workbench; opportunity linking; two customers, three viewport sizes, holdings and other-persona isolation.');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
