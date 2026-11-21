// Commercial Atlas review mock. Source rows stay attached to the captured company or activity.
window.enhanceCommercialReview = function (api, base) {
  const { state, E, compact, date, modal, navigate, render, read, write } = api;
  const D = commercialData;
  const rows = key => D.datasets[key] || [];
  const count = n => Number(n).toLocaleString('en-US');
  const company = id => D.accounts.find(row => row.Id === id)?.Name || id;
  const button = (label, action, key = '', style = 'secondary') =>
    `<button type="button" class="${style}" data-review="${action}" data-key="${E(key)}">${E(label)}</button>`;
  const sourceButton = (label, action, key, style = 'secondary') =>
    `<button type="button" class="${style}" data-ca="${action}" data-key="${E(key)}">${E(label)}</button>`;
  const metric = (label, value) => `<div><dt>${E(label)}</dt><dd>${E(String(value))}</dd></div>`;
  const history = key => rows('crmHistory').filter(r => r.m === key).sort((a,b) => b.k - a.k);
  const current = key => history(key).at(-1)?.v;
  const revenue = rows('firmoMix').filter(r => r.dim === 'revenue');
  const profiled = revenue.reduce((total,r) => total + r.n,0);
  const upmarket = revenue.filter(r => ['$1B+', '$200M-$1B', '$50M-$200M'].includes(r.band)).reduce((n,r) => n+r.n,0);
  const market = rows('marketSummary')[0];
  const service = rows('serviceSummary')[0];
  const activities = [
    ...D.crm.events.map(r => ({r, type:'meeting', when:r.StartDateTime})),
    ...D.crm.tasks.map(r => ({r, type:'task', when:r.ActivityDate})),
  ].filter(a => a.when).sort((a,b) => b.when.localeCompare(a.when));
  const storage = 'cumulus.commercial.review-pins.' + D.ownerId;
  let pins = read(storage, []);
  if (!Array.isArray(pins)) pins = [];
  let narration;
  let ledger = 'agenda', agendaFilter = 'all', offerView = 'rising', offerLimit = 5;
  const close = () => document.getElementById('record-dialog')?.close();
  const trend = (values, label) => {
    const min = Math.min(...values), max = Math.max(...values);
    return `<span class="cr-bars" role="img" aria-label="${E(label)}">${values.map(v =>
      `<i style="height:${max===min ? 55 : 15+75*(v-min)/(max-min)}%"></i>`).join('')}</span>`;
  };
  function pulse() {
    const meter = (part,total) => `<span class="cr-meter"><i style="width:${100*part/Math.max(1,total)}%"></i></span>`;
    return `<section class="cr-pulse"><header><div class="cr-pulse-title"><h2>Portfolio pulse</h2><small>Nov 13, 2026</small></div>${button('Read book briefing ↗','brief','','text-button')}</header><div class="cr-pulse-body">
      <button data-review="go" data-key="health#cr-growth"><span>Growth-tier mix</span><strong>${count(upmarket)}<small> / ${count(profiled)}</small></strong>${meter(upmarket,profiled)}<em>Companies with $50M+ revenue</em></button>
      <button data-review="go" data-key="health#cr-market"><span>Branch exposure</span><strong>${count(market.consolidate)}<small> / ${count(market.clients)}</small></strong>${meter(market.consolidate,market.clients)}<em>Clients near Consolidate branches</em></button>
      <button data-review="go" data-key="work#cases"><span>Open service cases</span><strong>${count(current('openCases')+service.open_n)}</strong>${trend(history('openCases').map(r=>r.v),'Weekly CRM open case counts')}<em>${count(current('openCases'))} CRM · ${service.open_n} ServiceNow</em></button></div></section>`;
  }
  // Captured Salesforce Models API response for the November 13 book snapshot.
  const briefPreview = [
    "The book currently includes 5614 companies scored and 3412 open opportunities, with an open pipeline valued at $3.63 billion. Notably, 259 clients are near branches flagged for consolidation, and 179 companies show multiple risk drivers. These figures may warrant attention to potential impacts on client relationships and deal flow.",
    "For Cameron-Olson Construction, the payment days beyond terms is 18, the paydex score is 68, and recent call sentiment is marked as \"Very Negative.\" How might these factors align with recent client interactions or payment behaviors? Are there specific concerns the client has raised that could explain the sentiment shift?",
    "Consider reviewing Cameron-Olson Construction's recent payment history and communication records to identify any actionable trends or issues. Additionally, assess whether other flagged companies near consolidation branches require proactive outreach."
];
  function brief() {
    modal('Daily brief', `<div class="cr-dialog"><p class="cr-date">Allen Carter · November 13, 2026</p>
      <h3>Risk and growth across the book</h3>${briefPreview.map(p=>`<p>${E(p)}</p>`).join('')}
      <dl class="cr-facts">${metric('Open pipeline',compact(D.crm.pipelineAmount))}${metric('Open opportunities',count(D.crm.pipelineCount))}${metric('Open leads',count(current('leads')))}${metric('Negative or watch outlook',count(rows('outlookSummary')[0].negative+rows('outlookSummary')[0].watch))}${metric('Leadership changes',count(rows('leadershipSummary')[0].turnover))}${metric('ESG movers',count(rows('esgSummary')[0].up+rows('esgSummary')[0].down))}</dl>
      <h3>Latest verified measures</h3><p class="cr-date">November 20, 2026 · Commercial book assessment</p><dl class="cr-facts">${metric('Credit Watch','490')}${metric('Negative and declining calls','77')}${metric('Modeled uplift','$16.5M')}${metric('Closed-won value · 30 days','$83.2M')}${metric('Activities dated in last 7 days','0')}${metric('Active banker goals','0')}</dl>
      <div class="ca-actions">${'speechSynthesis' in window ? button('Listen to briefing','listen') : ''}${button('Source dates','sources')}${button('Open company intelligence','go','intelligence','primary')}</div></div>`);
  }
  function sources() {
    const entries = [['whoSummary','Commercial priority model'],['firmoMix','ZoomInfo firmographics'],['markets','ESRI market footprint'],['netFlow','Business transactions'],['outlookSummary','Moody’s outlook'],['esgSummary','MSCI ESG'],['leadershipSummary','BoardEx leadership']];
    modal('Portfolio sources',`<div class="cr-dialog">${entries.map(([k,label]) => `<div class="cr-source"><strong>${label}</strong><span>${E(D.sources[k]?.state || 'Unavailable')} · ${E(D.sources[k]?.capturedAt || 'Date unavailable')}</span></div>`).join('')}${button('Back to briefing','brief')}</div>`);
  }
  function agendaRows(items) {
    return items.map(({r, type, when}) => {
      const stamp = new Date(when.slice(0,10)+'T12:00:00Z');
      return `<button type="button" class="cr-agenda-row" data-ca="activity" data-key="${type}|${E(r.Id)}"><time datetime="${E(when.slice(0,10))}"><small>${stamp.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})}</small>${stamp.getUTCDate()}</time><span><strong>${E(r.Subject)}</strong><small>${E(r.Account?.Name || company(r.AccountId))} · ${type==='meeting'?'Meeting':E(r.Priority || 'Task')}</small></span><b aria-hidden="true">↗</b></button>`;
    }).join('');
  }
  function switcher(choices, active, action) {
    return `<div class="cr-switch" role="group">${choices.map(([id,text])=>`<button type="button" data-review="${action}" data-key="${id}" aria-pressed="${active===id}">${text}</button>`).join('')}</div>`;
  }
  function enhanceToday(host) {
    const hero=host.querySelector('.ca-hero');
    hero.insertAdjacentHTML('beforeend',`<section class="ca-brief-band"><h2>Daily brief</h2><p><small>Agentforce · Nov 13 snapshot</small><br>${E(briefPreview[0])}</p>${button('Read daily brief','brief')}</section>`);
    hero.insertAdjacentHTML('afterend',pulse());
    const queue = host.querySelector('.ca-master-detail'), detail = queue.querySelector('.ca-detail');
    queue.closest('.ca-panel').querySelector('h2').textContent = 'Action workspace';
    const key = detail.querySelector('[data-ca="follow"]')?.dataset.key;
    const account = detail.querySelector('[data-ca="company"]')?.dataset.key;
    if (key && account) {
      const pinned = pins.some(p=>p.key===key);
      detail.insertAdjacentHTML('afterbegin',`<button type="button" class="cr-pin" data-review="pin" data-key="${E(key)}" data-account="${E(account)}" aria-pressed="${pinned}">${pinned?'Pinned':'Pin for follow-up'}</button>`);
    }
    queue.insertAdjacentHTML('afterend',`<div class="cr-work-footer"><span>Pinned follow-ups <strong>${pins.length}</strong></span>${button('Review follow-ups →','review-pins','','text-button')}</div>`);
    const dealPanel = host.querySelector('.ca-today-grid > :last-child');
    dealPanel.querySelector('header').innerHTML='<h2>Agenda &amp; pipeline</h2>';
    if (ledger !== 'deals') [...dealPanel.children].filter(el=>el.tagName!=='HEADER').forEach(el=>el.remove());
    dealPanel.querySelector('header').insertAdjacentHTML('afterend',switcher([['agenda','Recorded agenda'],['deals','Open deals']],ledger,'ledger'));
    if(ledger==='agenda') {
      const distinct=activities.filter((v,i,a)=>a.findIndex(n=>n.r.AccountId===v.r.AccountId)===i);
      dealPanel.insertAdjacentHTML('beforeend',agendaRows(distinct.slice(0,3))+button('Open activity & plans →','go','journey#cr-agenda','text-button'));
    } else dealPanel.insertAdjacentHTML('beforeend',button('Open deal room →','go','pipeline','text-button'));
  }
  function reviewPins() {
    modal('Review pinned follow-ups',`<div class="cr-dialog"><p>${pins.length ? 'Choose the company follow-ups to keep as local task proposals.' : 'Pin a recommendation in the action workspace to prepare its follow-up here.'}</p>
      ${pins.map(p=>`<label class="cr-pinned-row"><input type="checkbox" data-review-pin value="${E(p.key)}" checked><span><strong>${E(company(p.account))}</strong><small>${E(p.title)}</small></span></label>`).join('')}
      <div class="ca-actions">${pins.length?button('Draft selected follow-ups','draft-pins','','primary'):''}${button('Open local proposals','go','work#drafts')}</div></div>`);
  }
  function coverage(host) {
    const target=host.querySelector('.ca-revenue-mix');
    if(!target)return;
    const growth=target.closest('section'), region=host.querySelector('.ca-market-grid').closest('section');
    growth.id='cr-growth'; region.id='cr-market';
    target.insertAdjacentHTML('beforebegin',`<div class="cr-lead-value"><strong>${count(upmarket)}</strong><span>upmarket companies out of ${count(profiled)} profiled</span></div>`);
    growth.insertAdjacentHTML('beforeend',`<div class="ca-actions">${button('Employee mix','employees')}${button('Treasury conversations','targets')}</div>`);
    region.querySelector('.ca-market-grid').insertAdjacentHTML('beforebegin',`<div class="cr-lead-value"><strong>${count(market.consolidate)}</strong><span>clients near Consolidate branches</span></div><dl class="cr-facts">${metric('Clients / profiled ZIPs',count(market.clients)+' / '+count(market.zips))}${metric('Affluent-market clients',count(market.affluent))}${metric('Average wealth / foot traffic',Math.round(market.wealth)+' / '+Math.round(market.traffic))}${metric('Average branch distance',market.dist.toFixed(1)+' mi')}</dl>`);
    region.querySelectorAll('[data-ca="market"]').forEach(b=>{const r=rows('markets').find(r=>r.zip===b.dataset.key);if(r)b.insertAdjacentHTML('beforeend',`<small>${E(r.state)} · foot traffic ${Math.round(r.traffic)}</small>`);});
  }
  function treasury(host) {
    const movements=host.querySelector('.ca-movers');
    host.querySelector('.ca-outcomes')?.insertAdjacentHTML('afterbegin','<span><strong>$16.5M</strong> modeled uplift · Nov 20</span>');
    host.querySelector('[data-offer-ledger]')?.insertAdjacentHTML('beforeend',offerLedger());
    if(!movements)return;
    const eligible=eligibleOffers().slice(0,4);
    movements.insertAdjacentHTML('beforeend',`<section><h3>Eligible offers</h3>${eligible.map(o=>`<button data-ca="offer" data-key="${E(o.acct+'|'+o.code)}"><span aria-hidden="true">◇</span><strong>${E(company(o.acct))}</strong><small>${E(api.offerLabels[o.code]||o.code)}</small><em>${compact(o.ev)} EV</em></button>`).join('')||'<p>No eligible offers captured.</p>'}</section>`);
  }
  function eligibleOffers() {
    return D.offers.filter(o=>o.rank!=null && o.value>0).map(o=>({acct:o.account,code:o.code,ev:o.value})).sort((a,b)=>b.ev-a.ev);
  }
  function offerLedger() {
    const list=offerView==='all' ? eligibleOffers() : rows(offerView);
    return `<div class="cr-offers">${switcher([['rising','Rising'],['falling','Falling'],['all','Eligible offers']],offerView,'offers')}
      <div class="cr-offer-list">${list.slice(0,offerLimit).map(o=>`<button data-ca="offer" data-key="${E(o.acct+'|'+o.code)}"><span><strong>${E(company(o.acct))}</strong><small>${E(api.offerLabels[o.code]||o.code)}</small></span><b>${o.ev_moved>0?'+':''}${compact(o.ev_moved??o.ev)}<small>${offerView==='all'?'expected value':'value change'}</small></b><i aria-hidden="true">↗</i></button>`).join('')}</div>
      <div class="cr-work-footer"><span>${Math.min(offerLimit,list.length)} of ${list.length} captured offers</span>${offerLimit<list.length?button('Show more','more-offers','','text-button'):''}</div></div>`;
  }
  const todayViews = [
    ['overview','Overview'], ['portfolio','Portfolio pulse'], ['agenda','Agenda & pipeline'],
    ['actions','Action workspace'], ['offers','Offer opportunities'],
  ];
  function todayNav(view) {
    const hour=new Date().getHours(),salutation=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
    const first=(typeof atlasShellData === 'undefined' ? '' : atlasShellData.sessionUser?.name || atlasShellData.sessionUser?.Name || '').trim().split(/\s+/)[0];
    return `<div class="cr-today-header"><nav class="cr-today-nav" aria-label="Commercial Today views">${todayViews.map(([key,label]) => {
      const params=new URLSearchParams({direction:'atlas',persona:'commercial',page:'today'});
      if(key!=='overview')params.set('review',key);
      return `<a href="?${E(params.toString())}" data-today-view="${key}" ${view===key?'aria-current="page"':''}>${E(label)}</a>`;
    }).join('')}</nav><p class="cr-greeting">${salutation}${first?', '+E(first):''}</p></div>`;
  }
  const panel = (title,body,action='') => `<section class="ca-panel cr-view-panel"><header><h2>${title}</h2>${action}</header>${body}</section>`;
  function portfolioView(host) {
    const last=rows('netFlow').at(-1), outlook=rows('outlookSummary')[0], esg=rows('esgSummary')[0];
    const signals=[
      ['Credit Watch','490','Severe failure risk or PAYDEX below 60 · Nov 20','health'],
      ['Call tone sliding','77','Negative and declining · Nov 20','intelligence'],
      ['Negative or watch outlook',count(outlook.negative+outlook.watch),'Moody’s · Nov 13','intelligence'],
      ['Leadership changes',count(rows('leadershipSummary')[0].turnover),'BoardEx · Nov 13','intelligence'],
      ['ESG movers',count(esg.up+esg.down),esg.up+' upgrades · '+esg.down+' downgrades · Nov 13','intelligence'],
    ];
    const row=(label,value,note,page)=>`<button class="cr-reading" ${page==='flow'||page==='development' ? `data-ca="${page}"` : `data-review="go" data-key="${E(page)}"`}><span><strong>${E(label)}</strong><small>${E(note)}</small></span><b>${E(value)}</b></button>`;
    const summary=host.querySelector('.cr-pulse');
    summary.querySelector('h2').textContent='Coverage & service';
    return summary.outerHTML + '<div class="cr-focus-grid">'+
      panel('Credit & relationship signals',signals.map(parts=>row(...parts)).join(''))+
      panel('Money & origination',[
        row('Business net flow',compact(last.credits-last.debits),'Week of '+last.week,'flow'),
        row('Open pipeline',compact(D.crm.pipelineAmount),count(D.crm.pipelineCount)+' open opportunities · Nov 13','pipeline'),
        row('Modeled uplift','$16.5M','5,601 clients with eligible offers · Nov 20','growth'),
        row('Leads & referrals',count(current('leads')),'Open leads · Nov 13','development'),
        row('Closed-won value','$83.2M','Last 30 days · Nov 20','pipeline'),
      ].join(''))+'</div>'+panel('Activity & goals',`<dl class="cr-facts">${metric('Activities in last 7 days · Nov 20','0')}${metric('Active banker goals · Nov 20','0')}</dl>`,button('Open activity & plans','go','journey','text-button'));
  }
  function agendaView(host) {
    const list=activities.filter(a=>agendaFilter==='all'||a.type===agendaFilter);
    const stages=[...new Set(rows('crmHistory').filter(r=>r.m.startsWith('stage:')).map(r=>r.m.slice(6)))];
    const stageList=stages.map(stage=>{
      const series=history('stage:'+stage),last=series.at(-1),prior=series.at(-2);
      return `<div class="cr-stage-reading"><span><strong>${E(stage)}</strong><small>${prior?.v ? ((last.v/prior.v-1)*100).toFixed(1)+'% week over week' : 'Prior period unavailable'}</small></span>${trend(series.map(r=>r.v),stage+' weekly pipeline')}<b>${compact(last.v)}</b></div>`;
    }).join('');
    const deals=host.querySelector('.ca-deal-strip')?.outerHTML || sourceDealStrip();
    return '<div class="cr-focus-grid">'+panel('Recorded agenda',switcher([['all','All records'],['task','Tasks'],['meeting','Meetings']],agendaFilter,'agenda-filter')+agendaRows(list.slice(0,4))+button('Review all '+list.length+' records','agenda-records','','text-button'))+
      panel('Pipeline movement',stageList+deals,button('Open deal room','go','pipeline','text-button'))+
      panel('Customer goals',D.crm.personalGoals.slice(0,3).map(g=>`<button class="cr-reading" data-ca="personal-goal" data-key="${E(g.Id)}"><span><strong>${E(g.Name)}</strong><small>${E(g.FinancialPlan?.Account?.Name||'')} · ${date(g.TargetDate)}</small></span><b>${compact(g.ActualAmount)} / ${compact(g.TargetAmount)}</b></button>`).join(''),button('Plans & life events','go','journey','text-button'))+
      panel('Service & referrals',`<div class="ca-actions">${button('Open service cases','go','work#cases')}${sourceButton('Leads & introductions','development','')}</div>`)+'</div>';
  }
  function sourceDealStrip() {
    return `<div class="ca-deal-strip">${D.crm.opportunities.slice(0,3).map(d=>
      `<button data-ca="deal" data-key="${E(d.Id)}"><span>${E(d.StageName)}</span><strong>${E(d.Account?.Name||company(d.AccountId))}</strong><em>${compact(d.Amount)}</em></button>`).join('')}</div>`;
  }
  function actionView(host) {
    const queue=host.querySelector('.ca-master-detail'), ledger=queue.closest('.ca-panel');
    const prepared=[...queue.querySelectorAll('.ca-queue [data-ca="queue"]')].slice(0,3).map(el=>{
      const title=el.querySelector('strong').textContent,subject=el.querySelector('small').textContent;
      return `<article class="cr-prepared"><strong>${E(title)}</strong><p>${E(subject)}</p><div class="ca-actions">${sourceButton('Review follow-up','follow',el.dataset.key)}${sourceButton('Snooze','snooze',el.dataset.key,'text-button')}</div></article>`;
    }).join('');
    ledger.querySelector('header h2').textContent='Ranked company work';
    return ledger.outerHTML+'<div class="cr-focus-grid">'+panel('Prepared actions',prepared||'<p>No recommendations match this queue filter.</p>')+
      panel('Pinned follow-ups',pins.length?pins.map(p=>`<div class="cr-source"><strong>${E(company(p.account))}</strong>${sourceButton('Open company','company',p.account,'text-button')}</div>`).join(''):'<p>Pin a company recommendation above to include it in a batch of follow-ups.</p>',button('Review batch','review-pins','','text-button'))+'</div>';
  }
  function todayLayout(host,root) {
    const requested=new URLSearchParams(location.search).get('review');
    const view=todayViews.some(([key])=>key===requested)?requested:'overview';
    const money=root.querySelector('.ca-flow')?.closest('.ca-panel');
    if(money)money.id='cr-money';
    if(view!=='overview'){
      const body=view==='portfolio'?portfolioView(host):view==='agenda'?agendaView(host):view==='actions'?actionView(host):
        panel('Offers across the book',offerLedger(),button('Open treasury & origination','go','growth','text-button'));
      const heading=todayViews.find(([key])=>key===view)[1];
      root.innerHTML=`<header class="cr-view-heading"><p>Allen Carter · Commercial banking</p><h1>${E(heading)}</h1></header>${body}`;
    }
    root.insertAdjacentHTML('afterbegin',todayNav(view));
  }
  function decorate(page,source) {
    const host=document.createElement('div');host.innerHTML=source;
    const root=host.querySelector('.ca-root');if(!root)return source;
    root.classList.add('cr-root');
    if(page==='today'){enhanceToday(host);todayLayout(host,root);}
    if(page==='health')coverage(host);
    if(page==='growth')treasury(host);
    if(page==='intelligence') {
      const outlook=rows('outlookSummary')[0], leaders=rows('leadershipSummary')[0], esg=rows('esgSummary')[0];
      const signals=[['Credit outlook',outlook.negative+outlook.watch,'Negative or watch outlook'],['Leadership',leaders.turnover,'Leadership changes'],['ESG Downgrade',esg.down,'ESG downgrades']];
      root.querySelector('.ca-intel-toolbar')?.insertAdjacentHTML('beforebegin',`<div class="cr-signal-strip" aria-label="Book signal totals">${signals.map(([family,n,label])=>`<button type="button" data-review="family" data-key="${family}"><strong>${count(n)}</strong><span>${label}</span><i aria-hidden="true">↗</i></button>`).join('')}</div>`);
    }
    if(page==='work' && root.querySelector('[data-ca="work-view"][data-key="cases"][aria-pressed="true"]')) {
      root.querySelector('.ca-work-filter')?.insertAdjacentHTML('beforebegin',`<dl class="cr-facts cr-service">${metric('Open CRM cases',count(current('openCases')))}${metric('Open ServiceNow cases',service.open_n)}</dl>`);
    }
    if(page==='pipeline') {
      host.querySelectorAll('.ca-stage-ribbon [data-ca="stage"]').forEach(b=>{
        const series=history('stage:'+b.dataset.key);if(series.length<2)return;
        const last=series.at(-1).v,prev=series.at(-2).v;
        b.querySelector('strong').textContent=compact(last);
        b.querySelector('small').textContent=prev ? ((last-prev)/prev*100).toFixed(1)+'% week over week' : 'Previous period unavailable';
      });
      const copy=host.querySelector('.cs-pipeline-total h2 + p');if(copy)copy.textContent='Compare weekly book totals by stage. Select a stage to review the captured deals below.';
      const stages=host.querySelector('.ca-stage-ribbon');if(stages){
        const totals=[...stages.querySelectorAll('[data-ca="stage"]')].map(b=>current('stage:'+b.dataset.key) || 0);
        stages.querySelectorAll('[data-ca="stage"]').forEach((b,i)=>b.style.setProperty('--cs-stage-height',Math.max(2,100*totals[i]/Math.max(1,...totals))+'%'));
      }
    }
    if(page==='journey') {
      const list=activities.filter(a=>agendaFilter==='all'||a.type===agendaFilter);
      const planning=root.querySelector('.ca-planning-top');
      planning?.insertAdjacentHTML('beforebegin',`<section class="ca-panel cr-agenda" id="cr-agenda"><header><h2>Recorded agenda</h2>${switcher([['all','All'],['task','Tasks'],['meeting','Meetings']],agendaFilter,'agenda-filter')}</header>${agendaRows(list.slice(0,4))}<div class="cr-work-footer"><span>${list.length} recorded in this capture</span>${button('Review all records','agenda-records','','text-button')}</div></section>`);
    }
    return host.innerHTML;
  }
  document.addEventListener('click',e=>{
    const link=e.target.closest('[data-today-view]');
    if(link && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button===0){
      e.preventDefault();
      if(link.href!==location.href)window.history.pushState(null,'',link.href);
      render();
      document.querySelector(`.cr-today-nav [data-today-view="${link.dataset.todayView}"]`)?.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'instant'});
      return;
    }
    const b=e.target.closest('[data-review]');
    if(!b || state.persona!=='commercial'||state.style!=='atlas')return;
    const action=b.dataset.review,key=b.dataset.key;
    if(action==='brief')brief();
    if(action==='sources')sources();
    if(action==='listen'){
      if(narration && window.speechSynthesis.speaking){window.speechSynthesis.cancel();narration=null;b.textContent='Listen to briefing';return;}
      const panel=b.closest('.cr-dialog');
      narration=new SpeechSynthesisUtterance([...panel.querySelectorAll('p,h3,dl')].map(el=>el.innerText).join('. '));
      narration.onend=narration.onerror=()=>{b.textContent='Listen to briefing';narration=null;};
      b.textContent='Stop listening';window.speechSynthesis.speak(narration);
    }
    if(action==='family'){
      const select=document.querySelector('[data-ca-family]');
      if(select){select.value=key;select.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    if(action==='go'){
      const [page,section]=key.split('#');close();navigate({page,client:'',sub:page==='work'?section||'tasks':''});
      if(section && page!=='work')requestAnimationFrame(()=>document.getElementById(section)?.scrollIntoView({block:'start'}));
    }
    if(action==='ledger'){ledger=key;render();}
    if(action==='agenda-filter'){agendaFilter=key;render();}
    if(action==='agenda-records')modal('Recorded agenda',`<div class="cr-dialog">${agendaRows(activities.filter(a=>agendaFilter==='all'||a.type===agendaFilter))}</div>`);
    if(action==='offers'){offerView=key;offerLimit=5;render();}
    if(action==='more-offers'){offerLimit+=10;render();}
    if(action==='employees')modal('Employees across the book',`<div class="cr-dialog"><dl class="cr-facts">${rows('firmoMix').filter(r=>r.dim==='employee').sort((a,b)=>parseInt(a.band)-parseInt(b.band)).map(r=>metric(r.band+' employees',count(r.n))).join('')}</dl></div>`);
    if(action==='targets')modal('Upmarket treasury conversations',`<div class="cr-dialog">${rows('upmarket').map(r=>{
      const pitch=/Workday/.test(r.tech)?'Payroll-connected disbursements':/Salesforce|HubSpot/.test(r.tech)?'Integrated invoicing and receivables':/Snowflake|AWS/.test(r.tech)?'API cash-position reporting':r.tech;
      return `<button class="cr-target" data-ca="company" data-key="${E(r.account_id)}"><span><strong>${E(company(r.account_id))}</strong><small>${E(r.tech||'Technology unavailable')}</small></span><b>${E(pitch||'Review company')} ↗</b></button>`;
    }).join('')}</div>`);
    if(action==='pin'){
      const detail=b.closest('.ca-detail'),existing=pins.some(p=>p.key===key);
      const selected=document.querySelector('.ca-queue button[aria-pressed="true"]');
      pins=existing?pins.filter(p=>p.key!==key):[...pins,{key,account:b.dataset.account,title:selected?.querySelector('small')?.textContent||'Company follow-up',detail:detail.querySelector('p')?.textContent||''}];
      write(storage,pins);render();
    }
    if(action==='review-pins')reviewPins();
    if(action==='draft-pins'){
      const selected=new Set([...document.querySelectorAll('#record-dialog [data-review-pin]:checked')].map(input=>input.value));
      if(!selected.size){api.toast('Select at least one follow-up.');return;}
      for(const p of pins.filter(p=>selected.has(p.key))){
        api.saveDraft('task',{name:company(p.account),relationship:company(p.account),accountId:p.account,sourceAccountId:p.account,sourceRef:p.key,sourceDate:D.capturedAt,title:p.title,notes:p.detail});
      }
      pins=pins.filter(p=>!selected.has(p.key));write(storage,pins);close();navigate({page:'work',client:'',sub:'drafts'});
    }
  });
  document.getElementById('record-dialog')?.addEventListener('close',()=>{if(narration){window.speechSynthesis.cancel();narration=null;}});
  return {...base,render(page,fallback){
    const html=base.render(page,fallback);
    return state.persona==='commercial'&&state.style==='atlas'&&html&&['today','journey','health','growth','pipeline','intelligence','work'].includes(page) ? decorate(page,html):html;
  }};
};
