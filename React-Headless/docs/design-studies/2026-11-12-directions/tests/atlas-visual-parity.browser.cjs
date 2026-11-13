/* Design-specific gate: layout and interaction evidence. Screenshot critique remains mandatory. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('output/playwright/atlas-visual-parity');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1512,height:1000}});page.setDefaultTimeout(7000);
 const errors=[],writes=[],failures=[],scenes=[],interactions=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.method()+' '+r.url());});
 const base=process.env.STUDY_URL||'http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html';
 const go=async(persona,route)=>{await page.goto(base+'?'+new URLSearchParams({direction:'atlas',persona,page:route}));await page.locator('#main-content').waitFor();};
 const attempt=async(key,fn)=>{try{await fn();interactions.push({key,result:'pass'});}catch(e){failures.push({key,message:e.message,url:page.url()});await page.screenshot({path:path.join(out,key+'-failure.png'),fullPage:true});}};
 try{
 for(const width of (process.env.ATLAS_QA_WIDTHS||'1512,1024,768,390').split(',').map(Number)){
  await page.setViewportSize({width,height:1000});
  for(const persona of (process.env.ATLAS_QA_PERSONAS||'wealth,commercial').split(','))for(const route of (process.env.ATLAS_QA_ROUTES||'pipeline,journey,growth,intelligence,health,work').split(',')){
   const key=`${persona}-${route}-${width}`;
   await attempt(key,async()=>{
    await go(persona,route);
    if(persona==='wealth'&&['pipeline','journey','health','work'].includes(route))await page.locator('.ws').waitFor();
    if(persona==='commercial'&&['pipeline','journey','health','work','growth'].includes(route))await page.locator('.cs-root').waitFor();
    const m=await page.locator('#main-content').evaluate(main=>{
     const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
     const scrolls=[...main.querySelectorAll('*')].filter(el=>visible(el)&&el.scrollWidth>el.clientWidth+3&&['auto','scroll'].includes(getComputedStyle(el).overflowX)&&!el.closest('nav,[role=tablist]')).map(el=>({class:el.className,width:el.clientWidth,scrollWidth:el.scrollWidth}));
     const tiny=[...main.querySelectorAll('button,label,svg text')].filter(el=>visible(el)&&parseFloat(getComputedStyle(el).fontSize)<11).map(el=>({text:el.textContent.trim().slice(0,70),font:getComputedStyle(el).fontSize}));
     return {pageWidth:document.documentElement.scrollWidth,text:main.innerText,headings:[...main.querySelectorAll('h1')].map(x=>x.textContent),graphicCount:[...main.querySelectorAll('svg[role=img],.cs-matrix,.ws-month-grid,.wc-matrix,.wa-capital-path')].filter(visible).length,scrolls,tiny,height:Math.round(main.getBoundingClientRect().height)};
    });
    assert(m.text.length>200,'Substantive content missing');assert(!/\bNaN\b|\[object Object\]/.test(m.text),'Invalid rendered value');assert(m.pageWidth<=width+1,`Page width ${m.pageWidth}>${width}`);
    assert.equal(m.headings.length,1,'Multiple complete page headings suggest stacked old and new pages');
    assert.equal(m.scrolls.length,0,'Horizontal content scroll '+JSON.stringify(m.scrolls));
    scenes.push({key,...m,text:undefined});
    if(width===1512||width===390)await page.screenshot({path:path.join(out,key+'.png'),fullPage:true});
   });
  }
 }
 for(const width of [1512,1024,768,390]){
  await page.setViewportSize({width,height:1000});
  for(const [persona,route,group,id] of [['wealth','growth','capitalView','whitespace'],['wealth','growth','capitalView','outside'],['wealth','growth','capitalView','acquisition'],...['plans','concentration','liquidity','trading'].map(id=>['wealth','intelligence','intelligenceView',id]),['commercial','growth','','coverage']]){
   await attempt(`${persona}-${id}-variant-${width}`,async()=>{await go(persona,route);await page.locator(persona==='wealth'?`[data-wcx-group=${group}][data-wcx-id=${id}]`:`[data-ca=growth-view][data-key=${id}]`).first().click();assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+1,'Analytical variant overflows');if(width===390){await page.screenshot({path:path.join(out,`${persona}-${id}-390.png`),fullPage:true});if(persona==='wealth'&&id==='whitespace'){assert.equal(await page.locator('[data-wcx-product]').inputValue(),'WM-MAS','Mobile coverage needs focused product default');await page.locator('[data-wcx=cell]').first().click();await page.waitForTimeout(400);const box=await page.locator('[data-wcx-detail]').boundingBox();assert(box.y>=-1&&box.y<1000,'Mobile selected evidence remains far below viewport: '+JSON.stringify(box));await page.screenshot({path:path.join(out,'wealth-whitespace-selected-390.png'),fullPage:true});}}});
  }
 }
 await page.setViewportSize({width:1512,height:1000});
 await attempt('wealth-probability-context',async()=>{await go('wealth','growth');await page.locator('[data-wcx-group=capitalView][data-wcx-id=whitespace]').click();await page.screenshot({path:path.join(out,'wealth-heatmap-1512.png'),fullPage:true});const cell=page.locator('[data-wcx=cell].scored').filter({hasText:'modeled EV'}).first(),id=await cell.getAttribute('data-wcx-id'),code=await cell.getAttribute('data-wcx-code');await cell.click();assert.equal(new URL(page.url()).searchParams.get('capitalAccount'),id);assert.equal(new URL(page.url()).searchParams.get('capitalProduct'),code);const detail=page.locator('[data-wcx-detail]');assert(await detail.locator('[data-wa=customer]').first().getAttribute('data-wa-id')===id);const proposal=detail.locator('[data-wa=offer-opportunity]');assert.equal(await proposal.getAttribute('data-wa-id'),id);assert.equal(await proposal.getAttribute('data-wa-code'),code);await proposal.click();assert(await page.locator('#action-form').isVisible(),'Exact opportunity proposal did not open');assert.equal(await page.locator('#action-form [name=accountId]').inputValue(),id);assert.equal(await page.locator('#action-form [name=amount]').inputValue(),'','Modeled EV populated Opportunity amount');});
 await attempt('wealth-lens-evidence',async()=>{for(const id of ['plans','concentration','liquidity','trading']){await go('wealth','intelligence');await page.locator(`[data-wcx-group=intelligenceView][data-wcx-id=${id}]`).click();const text=await page.locator('#main-content').innerText();assert(text.length>600,'Empty analytical lens '+id);await page.screenshot({path:path.join(out,'wealth-intelligence-'+id+'-1512.png'),fullPage:true});}await go('wealth','growth');await page.locator('[data-wcx-group=capitalView][data-wcx-id=acquisition]').click();await page.locator('[data-wcx-group=acquisitionView][data-wcx-id=owners]').click();assert.match(await page.locator('#main-content').innerText(),/No owner-client rows returned/,'Successful-empty owner-client source obscured');await page.screenshot({path:path.join(out,'wealth-business-owners-1512.png'),fullPage:true});});
 await attempt('wealth-pipeline-exact-deal',async()=>{
  await go('wealth','pipeline');const select=page.locator('[data-ws-change=stage]');const values=await select.locator('option').evaluateAll(es=>es.map(e=>e.value));assert(values.length>1);await select.selectOption(values[1]);
  const deal=page.locator('.ws-deal-list [data-ws=deal]').first();if(await deal.count()){const id=await deal.getAttribute('data-id');await deal.click();assert((await page.locator('.ws-deal-focus').textContent()).includes(id),'Focus lacks exact source deal');await page.locator('[data-ws=deal-task]').click();assert(await page.locator('#action-form').isVisible(),'Exact follow-up form did not open');}
 });
 await attempt('wealth-calendar-selection',async()=>{await go('wealth','journey');await page.locator('.ws-month-grid').waitFor();const day=page.locator('.ws-month-days button.has-moments').first();assert(await day.count(),'No marked captured days');const date=await day.getAttribute('data-id');await day.click();assert.equal(await page.locator(`[data-ws=life-day][data-id="${date}"]`).getAttribute('aria-pressed'),'true');assert(await page.locator('[data-ws=life-clear]').count(),'Month reset missing');});
 await attempt('wealth-review-graph-selection',async()=>{await go('wealth','health');await page.locator('[data-ws=review-mode][data-id=risk]').first().click();const point=page.locator('.ws-risk-map [data-ws=plan]').first();assert(await point.count(),'Risk map has no actionable observations');const id=await point.getAttribute('data-id');await point.press('Enter');assert.equal(await page.locator('.ws-plan-focus [data-wa=propose]').getAttribute('data-wa-id'),id,'Review proposal uses a different household');});
 await attempt('commercial-probability-context',async()=>{await go('commercial','growth');await page.locator('[data-ca=growth-view][data-key=coverage]').first().click();assert.equal(await page.locator('.cs-matrix-row').count(),12);const cell=page.locator('.cs-score').first(),key=await cell.getAttribute('data-key');await cell.click();const draft=page.locator('[data-ca=offer-draft]');assert(await draft.isVisible(),'Selected product has no proposal action');assert.equal(await draft.getAttribute('data-key'),key,'Proposal target differs from heat map cell');await draft.click();assert(await page.locator('#ca-proposal-form').isVisible(),'Proposal form missing');});
 await attempt('commercial-credit-selection',async()=>{await go('commercial','health');const company=page.locator('.cs-company-picker [data-cs=credit]').nth(1);const id=await company.getAttribute('data-key');await company.click();assert.equal(await page.locator('.cs-credit-focus [data-ca=company]').getAttribute('data-key'),id);await page.locator('.cs-band-legend [data-cs=band]').nth(1).click();assert.equal(await page.locator('.cs-band-legend [data-cs=band]').nth(1).getAttribute('aria-pressed'),'true');});
 await attempt('commercial-work-mode-identity',async()=>{await go('commercial','work');const tasks=page.locator('[data-ca=work-view][data-key=tasks]');if(await tasks.count())await tasks.click();const banner=await page.locator('.cs-triage-ledger').innerText();assert(!/EXECUTION\s*\/\s*EVENTS/.test(banner),'Tasks incorrectly labeled as Events');});
 }finally{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scenes,interactions,failures,errors,writes},null,2));await browser.close();
 }
 console.log(JSON.stringify({scenes:scenes.length,interactions:interactions.length,failures,errors,writes},null,2));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(failures,[]);
})().catch(e=>{console.error(e);process.exitCode=1;});
