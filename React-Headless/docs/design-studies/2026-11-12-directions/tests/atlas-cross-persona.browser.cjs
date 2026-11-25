/* Cross-persona presentation and state-isolation gate. Source-contract journeys live in persona suites. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const out=path.resolve('output/playwright/atlas-cross-persona');fs.mkdirSync(out,{recursive:true});
 const page=await browser.newPage({viewport:{width:1512,height:1000}});page.setDefaultTimeout(7000);
 const errors=[],writes=[],failures=[],layouts=[],routes=[];
 page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
 page.on('request',r=>{if(r.method()!=='GET')writes.push({method:r.method(),url:r.url()});});
 const base=process.env.STUDY_URL||'http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html';
 const url=(persona,page,extra={})=>base+'?'+new URLSearchParams({direction:'atlas',persona,page,...extra});
 const clients={wealth:['001am00000qvjsAAAQ','Julie E Morris'],commercial:['001am00002AAAvtAAH','Cameron-Olson Construction']};
 const personas=(process.env.ATLAS_QA_PERSONAS||'wealth,commercial').split(',');
 const widths=(process.env.ATLAS_QA_WIDTHS||'1512,1024,768,390').split(',').map(Number);
 const pages=['today','relationships','pipeline','journey','growth','intelligence','health','work'];
 const check=async(persona,route,width,extra={})=>{
  const key=[persona,route,extra.tab||'directory',width].join('-');
  try{
   await page.goto(url(persona,route,extra));
   await page.locator('#main-content').waitFor();
   const metrics=await page.evaluate(()=>{
    const main=document.querySelector('#main-content');
    const scrollables=[...main.querySelectorAll('*')].filter(el=>{
     const css=getComputedStyle(el),rect=el.getBoundingClientRect();
     return rect.width>0&&rect.height>0&&el.scrollWidth>el.clientWidth+3&&['auto','scroll'].includes(css.overflowX)&&!el.closest('nav,[role="tablist"]');
    }).map(el=>({tag:el.tagName,class:el.className,width:el.clientWidth,scrollWidth:el.scrollWidth,text:el.textContent.trim().slice(0,110)}));
    const metrics=[...main.querySelectorAll('.wa-metric,.ca-metric,.ca-stat,.ca-pulse>button')].map(el=>({label:el.querySelector('span,dt,small')?.textContent.trim()||'',value:el.querySelector('strong,dd,b')?.textContent.trim()||''}));
    const smallActions=[...main.querySelectorAll('.wa button,.ca-root button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(Number.parseFloat(getComputedStyle(el).fontSize)<12||r.height<32);}).map(el=>({text:el.textContent.trim().slice(0,60),font:getComputedStyle(el).fontSize,height:Math.round(el.getBoundingClientRect().height)}));
    const smallChartLabels=[...main.querySelectorAll('.wa-history b,.wa-history small,.wa-tradechart b,.wa-tradechart small')].filter(el=>Number.parseFloat(getComputedStyle(el).fontSize)<12).map(el=>({text:el.textContent.trim().slice(0,40),font:getComputedStyle(el).fontSize}));
    return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,mainWidth:main.scrollWidth,text:main.innerText,scrollables,metrics,readability:{smallActions:smallActions.slice(0,8),smallActionCount:smallActions.length,smallChartLabels:smallChartLabels.slice(0,8),smallChartLabelCount:smallChartLabels.length}};
   });
   assert(metrics.text.length>100,'Page content missing');
   assert(!/\bNaN\b|\[object Object\]/.test(metrics.text),'Invalid rendered value');
   assert(!/function workPage\(|\$\{(?:rows\.map|fact\(|E\()/.test(metrics.text),'JavaScript source rendered as page content');
   const currencyCounts=metrics.metrics.filter(m=>/^(Plans below 70%|Reviews in 30 days|Active \/ stale plans|Below (?:70|50)%|Due in 30 days|Stale|Goal count|Households|Households with holdings|Concentrated|Captured open opportunities|Open opportunities|Open cases|Leads|Referrals|Companies|At-risk companies|Captured companies|Signals|Multiple risk drivers)$/i.test(m.label)&&/[$€£]/.test(m.value));
   assert.equal(currencyCounts.length,0,'Count rendered as currency: '+JSON.stringify(currencyCounts));
   assert(metrics.pageWidth<=width+1,`Page overflow ${metrics.pageWidth}>${width}`);
   const customerScroll=metrics.scrollables.filter(s=>/household|customer|relationship|directory|coverage|offer|growth|wa-|ca-/.test(String(s.class))&&!/chart|plot|timeline/.test(String(s.class)));
   assert.equal(customerScroll.length,0,'Content horizontal scrolling: '+JSON.stringify(customerScroll));
   if(extra.client)assert(metrics.text.includes(clients[persona][1]),'Selected relationship title missing');
   layouts.push({key,pageWidth:metrics.pageWidth,scrollables:metrics.scrollables,readability:metrics.readability});
   routes.push({key,url:page.url(),heading:await page.locator('#main-content h1').allTextContents()});
   if(width===1512||width===390)await page.screenshot({path:path.join(out,key+'.png'),fullPage:true});
  }catch(e){failures.push({key,message:e.message,url:page.url()});await page.screenshot({path:path.join(out,key+'-failure.png'),fullPage:true}).catch(()=>{});}
 };
 try{
  for(const width of widths){
   await page.setViewportSize({width,height:1000});
   for(const persona of personas){
    for(const route of pages)await check(persona,route,width);
    for(const tab of ['overview','finances','growth','engagement','notebook',...(persona==='commercial'?['intel']:[])])await check(persona,'relationships',width,{client:clients[persona][0],tab});
   }
  }
  if(process.env.ATLAS_QA_PRESENTATION_ONLY!=='1'){
  await page.setViewportSize({width:1512,height:1000});
  await page.goto(url('wealth','relationships',{client:clients.wealth[0],tab:'growth'}));
  await page.locator('#persona-select').selectOption('commercial');
  assert.equal(new URL(page.url()).searchParams.get('client'),null,'Persona switch retained previous household');
  assert.equal(await page.locator('body').getAttribute('data-persona'),'commercial');
  await page.locator('#persona-select').selectOption('wealth');
  assert.equal(new URL(page.url()).searchParams.get('client'),null,'Return retained other persona selection');
  await page.evaluate(()=>sessionStorage.setItem('cumulus.complete.drafts',JSON.stringify([
   {id:'qa-wealth',persona:'wealth',kind:'task',title:'QA Wealth-only proposal',relationship:'Test fixture',name:'Test fixture'},
   {id:'qa-commercial',persona:'commercial',kind:'task',title:'QA Commercial-only proposal',relationship:'Test fixture',name:'Test fixture'}
  ])));
  for(const persona of ['wealth','commercial']){
   await page.goto(url(persona,'today'));
   await page.getByRole('button',{name:'Review local drafts',exact:true}).click();
   const text=await page.locator('#main-content').innerText();
   assert(text.includes(persona==='wealth'?'QA Wealth-only proposal':'QA Commercial-only proposal'),'Own persona proposal absent');
   assert(!text.includes(persona==='wealth'?'QA Commercial-only proposal':'QA Wealth-only proposal'),'Other persona proposal leaked');
   await page.reload();
   await page.getByRole('button',{name:'Review local drafts',exact:true}).click();
   assert((await page.locator('#main-content').innerText()).includes(persona==='wealth'?'QA Wealth-only proposal':'QA Commercial-only proposal'),'Local proposal lost on reload');
  }
  }
 }catch(e){failures.push({key:'state-isolation',message:e.message,url:page.url()});}
 finally{
  const report={layouts:layouts.length,routes,failures,errors,writes,scrollableContent:layouts.filter(x=>x.scrollables.length),readabilityObservations:layouts.filter(x=>x.readability.smallActionCount||x.readability.smallChartLabelCount).map(({key,readability})=>({key,...readability}))};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({layouts:layouts.length,failures,errors,writes,scrollableContent:report.scrollableContent},null,2));
  await browser.close();
 }
 assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(writes,[],'Unexpected write requests');assert.deepEqual(failures,[],'Cross-persona layout/state failures');
 console.log('Passed requested persona page/customer layouts and enabled state-isolation checks. See report.json for readability observations.');
})().catch(e=>{console.error(e);process.exitCode=1;});
