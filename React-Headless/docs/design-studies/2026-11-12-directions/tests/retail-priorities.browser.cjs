/* Local mock verification. Source failures/recency are simulated only in isolated test contexts. */
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1512,height:1000}}),page=await context.newPage();page.setDefaultTimeout(8000);
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url())});
 const base=process.env.STUDY_URL||'http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html';
 const url=(route='today',persona='retail')=>base+'?'+new URLSearchParams({direction:'atlas',persona,page:route});
 const out=path.resolve('output/playwright/retail-priorities');fs.mkdirSync(out,{recursive:true});
 const noOverflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 let layouts=0;
 for(const width of [1512,1024,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto(url());await noOverflow();assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.locator('.pr-workspace').count(),1);assert.equal(await page.locator('.rv-priority-desk').count(),0);
  assert((await page.locator('.pr-pulse').innerText()).includes('$9.2K'));assert((await page.locator('.pr-pulse').innerText()).includes('91'));
  assert.equal(await page.locator('.pr-ranked-list>button').count(),8);
  assert((await page.locator('.pr-ranked-list').innerText()).includes('Overdue task'));assert((await page.locator('.pr-ranked-list').innerText()).includes('UserGems liquidity'));
  const first=page.locator('.pr-ranked-list>button').first();await first.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-selected-priority]').getAttribute('data-selected-priority'),await first.getAttribute('data-key'));
  for(const tier of ['today','week','watch','all']){await page.locator('[data-pr=tier][data-value='+tier+']').click();await noOverflow();}
  if(width===1512){const hero=await page.locator('.day-hero').boundingBox(),pipeline=await page.locator('.rv-pipeline-card').boundingBox(),queue=await page.locator('.pr-workspace').boundingBox();assert(hero.y<pipeline.y&&pipeline.y<queue.y);assert(pipeline.y<1000);}
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(out,'today-'+width+'.png'),fullPage:true});layouts++;
 }
 await page.setViewportSize({width:1512,height:1000});await page.goto(url());
 const sourceBefore=await page.evaluate(()=>JSON.stringify(retailPriorityData.datasets));
 const originalName=await page.locator('.day-outreach-person h2').innerText(),account=await page.locator('.day-outreach-links [data-action=client]').getAttribute('data-id');
 await page.locator('.day-first-move [data-pr=why]').click();assert((await page.locator('dialog[open]').innerText()).includes('Driver')||await page.locator('.pr-driver-list').count());await page.keyboard.press('Escape');
 await page.locator('[data-day=prep]').click();assert((await page.locator('#prep-notes').inputValue()).length>30);await page.keyboard.press('Escape');
 await page.locator('[data-day=meeting]').click();assert.equal(await page.locator('[name=accountId]').inputValue(),account);await page.keyboard.press('Escape');
 await page.locator('.day-first-move [data-pr=snooze]').click();assert.notEqual(await page.locator('.day-outreach-person h2').innerText(),originalName);await page.reload();assert.notEqual(await page.locator('.day-outreach-person h2').innerText(),originalName);
 await page.locator('[data-pr=restore]').first().click();assert.equal(await page.locator('.day-outreach-person h2').innerText(),originalName);
 for(let i=0;i<8;i++){const b=page.locator('.day-first-move [data-pr=snooze]');if(!await b.count())break;await b.click();}
 assert.equal(await page.locator('.pr-first-empty').count(),1);assert((await page.locator('.pr-first-empty').innerText()).includes('snoozed'));await page.locator('.pr-first-empty [data-pr=restore]').click();
 await page.locator('.day-first-move [data-pr=quick]').click();await page.locator('dialog[open] [data-pr=client]').click();assert.equal(new URL(page.url()).searchParams.get('client'),account);assert((await page.locator('main').innerText()).includes('Service-recovery outreach'));
 await page.goto(url());
 const selectedKey=await page.locator('[data-selected-priority]').getAttribute('data-selected-priority');
 await page.locator('.pr-selection [data-pr=task]').click();const linked=await page.locator('[name=accountId]').inputValue();assert(linked);assert.equal(await page.locator('[name=priority]').inputValue(),'High');assert(await page.locator('[name=date]').inputValue());await page.getByRole('button',{name:/Keep local draft/}).click();
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('cumulus.complete.drafts')).at(-1));assert.equal(draft.accountId,linked);assert(draft.notes.includes('Source:'));
 await page.locator('.pr-selection [data-pr=snooze]').click();assert.equal(await page.locator('.pr-ranked-list>button[data-key="'+selectedKey+'"]').count(),0);assert.equal(await page.locator('.pr-ranked-list>button').count(),8);await page.locator('[data-pr=restore]').first().click();
 await page.locator('[data-pr=flow]').click();assert((await page.locator('dialog[open]').innerText()).includes('$9,225'));assert.equal(await page.locator('.pr-flow-table>div').count(),8);await page.screenshot({path:path.join(out,'flow.png')});await page.keyboard.press('Escape');
 await page.locator('[data-pr=attention]').click();assert((await page.locator('dialog[open]').innerText()).includes('91 customers'));await page.keyboard.press('Escape');
 await page.locator('[data-pr=leads]').click();assert.equal(new URL(page.url()).searchParams.get('page'),'prospecting');
 await page.goto(url('pipeline'));await page.locator('[data-pr=history]').click();assert.equal(await page.locator('.pr-flow-table>div').count(),8);await page.locator('[data-pr-history]').selectOption('stage:Qualification');assert((await page.locator('dialog[open]').innerText()).includes('currently open opportunities'));await page.keyboard.press('Escape');
 await page.goto(url());assert.equal(await page.evaluate(()=>JSON.stringify(retailPriorityData.datasets)),sourceBefore);
 for(const persona of ['wealth','commercial']){await page.goto(url('today',persona));assert.equal(await page.locator('.pr-workspace,.pr-pulse').count(),0);assert.equal(await page.locator('h1').count(),1);await noOverflow();layouts++;}
 const unavailable=await browser.newContext({viewport:{width:1024,height:1000}}),missing=await unavailable.newPage();missing.setDefaultTimeout(8000);missing.on('pageerror',e=>errors.push(e.message));
 const raw=fs.readFileSync(path.join(__dirname,'..','retail-priority-data.js'),'utf8');
 await missing.route('**/retail-priority-data.js*',r=>r.fulfill({contentType:'text/javascript',body:raw+"\nfor(const k of ['who','summary','netFlow']) retailPriorityData.sources[k].state='unavailable';"}));
 await missing.goto(url());assert((await missing.locator('.pr-first-empty').innerText()).includes('unavailable'));assert((await missing.locator('.pr-pulse').innerText()).includes('Unavailable'));assert((await missing.locator('.pr-source-state').innerText()).includes('unavailable'));assert(await missing.locator('.pr-ranked-list>button').count());await missing.locator('[data-pr=flow]').click();assert((await missing.locator('dialog[open]').innerText()).includes('unavailable'));
 await unavailable.close();
 const recentContext=await browser.newContext(),recent=await recentContext.newPage();recent.setDefaultTimeout(8000);recent.on('pageerror',e=>errors.push(e.message));
 const retailRaw=fs.readFileSync(path.join(__dirname,'..','retail-data.js'),'utf8');await recent.route('**/retail-data.js*',r=>r.fulfill({contentType:'text/javascript',body:retailRaw+"\nretailData.datasets.browsing[0].lastseen='2026-11-13T04:30:00Z';"}));
 await recent.goto(url());const browserId=await recent.evaluate(()=>retailData.datasets.browsing[0].account);assert.equal(await recent.locator('.day-outreach-links [data-action=client]').getAttribute('data-id'),browserId);assert((await recent.locator('.day-first-move').innerText()).includes('Recognized website browsing'));
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({layouts,errors,writes,journeys:'queue tiers, keyboard, source evidence, exact-account prep/call/task, session snooze/restore, cohort-independent 360, signed weekly flow, pipeline stage history, source failure and recent-browser override'},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
