// Study 03 changes presentation only. Existing study data and interaction
// handlers are reused; production apps, metadata and integrations are untouched.
const renderStudy02=render;
let wealthLens='plans',commercialLens='relationships';
// Values visibly rendered in the deployed Wealth app during the Nov 12 review,
// under Jose Sifontes' My book scope. Preserve displayed precision and periods.
const reviewedWealthMetrics=[
 ['Held-away opportunity','$2.2M','5 clients · brokerage + robo','heldaway','Captured book value from the deployed Wealth home. The linked-client panel below shows two saved examples, not all five clients.'],
 ['Plans at risk','3,014','Below 70% success · 141 below 50%','plans','Captured Wealth book value. The same card reported 537 stale plans and 108 reviews due in 30 days. Selected household examples below are not the full population.'],
 ['Reviews due','108','Next 30 days · captured Nov 12','plans','Captured from the deployed Plans at Risk card. Retain the existing dated review queue and preparation workflow. This is a review count, not a scheduled-meeting count.'],
 ['Net flow','$204.8K','Week of Nov 2 · 27 accounts','netflow','Captured credits minus debits over the displayed completed week, from Snowflake through Data 360. This is flow, not account balance or investment return.']
];
const sectionCatalog={
 retail:[['Today','Brief, Right Now, priority queue, recommended actions, agenda, goals, pipeline movement, cases, leads and opportunities.'],['Growth','Cross-sell white-space and movers, growth KPIs, life-stage mix, web engagement, pipeline and leads.'],['Health','Full KPI set, portfolio pulse, property hazards, financial stress, deposit attrition, alerts and life events.']],
 wealth:[['Households','Brief, Right Now, priorities, recommendations, workspace 360, goals, tasks, service and relationships.'],['Capital & growth','Cross-sell and movers, held-away assets, crypto/robo leakage, trading pulse, business-owner clients, upgrade prospects, opportunities and leads.'],['Plans & protection','Plan health and reviews, concentration, call sentiment, AML changes, liquidity events, alerts, source freshness and financial goals.']],
 commercial:[['Relationship book','Brief, priority queue, recommendations, company workspace, work/calendar and relationship activity.'],['Growth & coverage','Pipeline, cross-sell and movers, firmographic mix, market footprint, owner-to-Wealth handoffs, leads, funding and intent.'],['Credit & intelligence','Payment watch, delinquency, outlook, governance, ESG, champion changes, screening, service and Company Intel.']]
};
render=function(){renderStudy02();composePersona();};
function section(title,subtitle,cls=''){const el=document.createElement('section');el.className=cls;el.innerHTML=`<div class="composition-heading"><div><h2>${title}</h2><p>${subtitle}</p></div></div>`;return el;}
function composePersona(){
 const dashboard=document.querySelector('.dashboard'),main=document.querySelector('.main');
 const q=document.getElementById('priorities'),pipeline=document.getElementById('pipeline'),inspector=document.getElementById('inspector');
 const support=[...document.querySelector('.support-grid').children],right=[...document.querySelector('.context-rail').children],work=right[1],agent=right[2];
 const d=cfg(),c=crm();
 document.querySelector('.studio>span').innerHTML='CUMULUS <i>/</i> COCKPIT STUDIES 03';
 document.querySelector('.brand-caption').textContent=persona==='retail'?'Relationship banking':persona==='wealth'?'Private advisory':'Commercial intelligence';
 document.querySelectorAll('.rail button').forEach(button=>{const label=button.textContent.replace(/\s+/g,' ').trim();if(label)button.setAttribute('aria-label',label)});
 document.querySelector('.page-heading p').textContent=persona==='retail'?'Customer needs, conversations, and daily business in one place.':persona==='wealth'?'Households, capital, and the decisions that deepen trust.':'A working view of relationships, credit, and growth.';
 const existingTabs=document.querySelector('.view-tabs');existingTabs.classList.add('composition-navigation');
 if(persona==='retail'){
  document.querySelector('h1').innerHTML='The relationship <em>desk.</em>';
  const day=document.createElement('div');day.className='retail-day-grid';
  const left=document.createElement('div');left.className='retail-day-work';left.append(work,agent);
  const center=document.createElement('div');center.className='retail-needs';center.append(q);
  const moments=section('Customer moments','Connected context changes the next conversation.','retail-moments');
  moments.innerHTML+=`<div class="moment-list"><button data-person="Gabe X Hoskins"><span class="moment-symbol coral">${icon('shield')}</span><span><b>Resolve the immediate need</b><small>Gabe · card and direct-deposit cases</small></span>${icon('arrow')}</button><button data-open="intent"><span class="moment-symbol blue">${icon('chart')}</span><span><b>Understand the next goal</b><small>HELOAN and Auto Loan website interest</small></span>${icon('arrow')}</button><button data-open="goals"><span class="moment-symbol ochre">${icon('heart')}</span><span><b>Recognize a life moment</b><small>Existing goals and life-event workflows</small></span>${icon('arrow')}</button></div>`;
  center.append(moments);
  const context=document.createElement('div');context.className='retail-customer';context.append(inspector);
  day.append(left,center,context);
  const business=section('Build the relationship. Grow the business.','Pipeline and customer context stay connected.','retail-business');business.append(pipeline);
  const details=document.createElement('div');details.className='retail-details';support.forEach(p=>details.append(p));
  dashboard.replaceChildren(day,business,details);dashboard.className='dashboard retail-composition';
  [...document.querySelectorAll('.metrics .metric')].forEach((el,i)=>el.classList.add(['metric-blue','metric-neutral','metric-teal','metric-coral','metric-ochre'][i]));
  q.querySelector('h2').innerHTML=icon('users')+'Needs & conversations';
 }else if(persona==='wealth'){
  document.querySelector('h1').innerHTML='The private advisory <em>desk.</em>';
  const metrics=[...document.querySelectorAll('.metric')];
  const pipelineMetric=metrics[0].cloneNode(true);metrics[4].replaceWith(pipelineMetric);
  reviewedWealthMetrics.forEach(([title,value,meta,kind,explanation],i)=>{const metric=metrics[i];metric.dataset.open=kind;metric.dataset.reviewMetric=String(i);metric.querySelector('.metric-title').innerHTML=title+icon(i===0?'chart':i===1?'heart':i===2?'clock':'chart');metric.querySelector('.metric-value').textContent=value;metric.querySelector('.metric-meta').textContent=meta;metric.querySelector('.mini-track')?.remove();});
  document.querySelector('.freshness').innerHTML='<i></i>Book capture Nov 12 · relationship examples Nov 10–11';
  // A horizontal capital ribbon is separate from complete CRM totals. Its
  // numbers are explicitly selected, historical linked-account examples.
  const capital=document.createElement('section');capital.className='wealth-capital';capital.setAttribute('aria-label','Selected held-away relationships');
  capital.innerHTML=`<div class="capital-label"><span class="eyebrow">Capital in view</span><h2>Outside assets.<br>Inside the conversation.</h2><p>Two saved linked clients · Nov 11</p></div><button data-person="David H Chen"><span>David H Chen <small>Charles Schwab</small></span><strong>$783.8K</strong><small>Outside balance · −$157.47 monthly flow</small></button><button data-person="Anika A Patel"><span>Anika A Patel <small>Wealthfront</small></span><strong>$34.8K</strong><small>Outside balance · +$2,384.02 monthly flow</small></button><div class="capital-action"><span class="eyebrow">Relationship opportunity</span><p>Understand the purpose<br>before proposing a transfer.</p><button class="link" data-open="heldaway">Review linked assets ↗</button></div>`;
  main.insertBefore(capital,existingTabs);
  const focus=document.createElement('div');focus.className='wealth-review-grid';
  const households=document.createElement('div');households.className='wealth-households';households.append(q);
  q.querySelector('h2').innerHTML='Household conversations';q.querySelector('.panel-header .subtitle').textContent='Choose a relationship to review';
  const dossier=document.createElement('div');dossier.className='wealth-dossier';
  const lens=document.createElement('div');lens.className='wealth-lens';lens.innerHTML=`<div class="eyebrow">The advisory workspace</div><div class="lens-tabs" role="group" aria-label="Advisory lens"><button data-wealth-lens="plans">Plans & priorities</button><button data-wealth-lens="capital">Capital & holdings</button><button data-wealth-lens="relationship">Relationship work</button></div><div id="wealth-lens-content"></div>`;
  dossier.append(inspector,lens);
  const workbench=document.createElement('div');workbench.className='wealth-workbench';workbench.append(work,agent);
  focus.append(households,dossier,workbench);
  const analytics=document.createElement('div');analytics.className='wealth-analytics';support.forEach(p=>analytics.append(p));
  const growth=section('Business development','Opportunities, stages, and the next relationship conversation.','wealth-business');growth.append(pipeline);
  dashboard.replaceChildren(focus,analytics,growth);dashboard.className='dashboard wealth-composition';
  renderWealthLens();
 }else{
  document.querySelector('h1').innerHTML='The relationship <em>exchange.</em>';
  const dealboard=section('Book intelligence','A company view that connects relationship signals to business decisions.','commercial-book');
  dealboard.querySelector('.composition-heading').innerHTML+=`<div class="lens-tabs" role="group" aria-label="Company lens"><button data-company-lens="relationships">Relationships</button><button data-company-lens="credit">Credit & payment</button><button data-company-lens="opportunity">Product opportunity</button></div>`;
  dealboard.innerHTML+='<div id="company-book-content"></div>';
  const top=document.createElement('div');top.className='commercial-exchange';
  const companies=document.createElement('div');companies.className='commercial-companies';companies.append(dealboard,q);q.querySelector('h2').innerHTML=icon('layers')+'Relationship action queue';
  const company=document.createElement('div');company.className='commercial-company';company.append(inspector);
  const intel=document.createElement('div');intel.className='company-intel-launch';intel.innerHTML=`<div class="eyebrow">Company intelligence</div><div class="intel-sources"><button data-intel="Firmographics">ZoomInfo <small>Firmographics</small></button><button data-intel="Governance">BoardEx <small>Governance</small></button><button data-intel="ESG">MSCI <small>ESG</small></button><button data-intel="Filings">SEC <small>Filings</small></button></div><p>Open the existing Company Intel view with the selected company.</p>`;company.append(intel);
  top.append(companies,company);
  const execution=document.createElement('div');execution.className='commercial-execution';execution.append(pipeline,work);
  const research=section('Coverage & external signals','Retain the broader book intelligence in dedicated working views.','commercial-research');
  research.innerHTML+=`<div class="research-strip">${[['intent','Intent & competitor research','Demandbase','intelligence'],['funding','Funding & liquidity','Harmonic','intelligence'],['champion','Champion movement','UserGems','intelligence'],['footprint','Market coverage','ESRI · ZoomInfo','intelligence']].map(([id,title,source,dest])=>`<button data-research="${id}"><span class="research-icon">${icon('layers')}</span><b>${title}</b><small>${source}</small><span>Explore signals ↗</span></button>`).join('')}</div>`;
  const details=document.createElement('div');details.className='commercial-details';support.forEach(p=>details.append(p));details.append(agent);
  dashboard.replaceChildren(top,execution,research,details);dashboard.className='dashboard commercial-composition';renderCompanyBook();
 }
 const directory=document.createElement('section');directory.className='section-directory';directory.innerHTML=`<div><span class="eyebrow">Explore your workspace</span><h2>More ways to understand your business.</h2></div><div class="section-directory-grid">${sectionCatalog[persona].map(([title,body],i)=>`<button data-directory="${i}"><b>${title}</b><span>${body}</span><small>Explore sections ${icon('arrow')}</small></button>`).join('')}</div>`;
 dashboard.append(directory);bindComposition();
}
function renderWealthLens(){
 const root=document.getElementById('wealth-lens-content');if(!root)return;
 document.querySelectorAll('[data-wealth-lens]').forEach(b=>{b.classList.toggle('active',b.dataset.wealthLens===wealthLens);b.setAttribute('aria-pressed',b.dataset.wealthLens===wealthLens)});
 if(wealthLens==='plans')root.innerHTML=`<div class="review-note"><span class="note-index">01</span><div><b>Bring the plan into the conversation.</b><p>Review modeled outcomes alongside the household’s priorities, rather than reading the probability in isolation.</p></div></div><div class="wealth-plan-comparison">${[['Graham',59.34],['Robles',42.03],['Julie E Morris',61.02]].map(([n,p])=>`<div><span>${n}</span><div class="track"><span style="width:${p}%;background:${p<50?'var(--danger)':'var(--accent)'}"></span></div><strong>${p.toFixed(1)}%</strong></div>`).join('')}</div><small class="lens-source">Selected saved plan examples · Nov 11 · not book totals</small>`;
 else if(wealthLens==='capital')root.innerHTML=`<div class="review-note"><span class="note-index">02</span><div><b>Julie’s MSFT position deserves a focused review.</b><p>31.4305% of holdings in the saved Nov 11 signal. Discuss concentration in the context of goals and preferences.</p></div></div><div class="holding-visual"><div class="holding-part"><span>MSFT</span><strong>31.4%</strong></div><div class="holding-rest"><span>Other holdings</span><strong>68.6%</strong></div></div><small class="lens-source">Selected client example · the active conversation is shown above</small>`;
 else root.innerHTML=`<div class="review-note"><span class="note-index">03</span><div><b>Keep the follow-through attached to the household.</b><p>Prepare the review, record the next step, manage goals, and carry the selected relationship into the full 360.</p></div></div><div class="review-actions"><button data-open="actions">Create follow-up ↗</button><button data-open="goals">Goals & life events ↗</button><button data-open="full360">Full relationship 360 ↗</button></div>`;
 document.querySelectorAll('[data-wealth-lens]').forEach(b=>b.onclick=()=>{wealthLens=b.dataset.wealthLens;renderWealthLens()});bindOpen(root);
}
function renderCompanyBook(){
 const root=document.getElementById('company-book-content');if(!root)return;
 document.querySelectorAll('[data-company-lens]').forEach(b=>{b.classList.toggle('active',b.dataset.companyLens===commercialLens);b.setAttribute('aria-pressed',b.dataset.companyLens===commercialLens)});
 const rows=[['Cameron-Olson Construction','Cameron-Olson','Very Negative','68','18','Negative · Ba2','32.36%','—'],['Burgess Supply','Burgess Supply','Not in fixture','26','100','Watch · Baa3','—','34.25%'],['Schroeder Contractors','Schroeder Contractors','Negative','—','—','Not in fixture','42.34%','—'],['Kennedy Ltd Enterprises','Kennedy Ltd','Not in fixture','—','—','Not in fixture','47.96%','—']];
 const columns=commercialLens==='credit'?['Company','PAYDEX','Days beyond terms','Moody’s outlook']:commercialLens==='opportunity'?['Company','Business checking','Commercial card','Model coverage']:['Company','Relationship tone','Credit / outlook','Opportunity'];
 root.innerHTML=`<div class="table-wrap"><table class="company-book-table"><thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(([full,n,t,pay,days,out,chk,card])=>`<tr><td><button class="company-name" data-company="${full}"><span class="company-monogram">${initials(n)}</span><span>${n}<small>Selected company signal</small></span></button></td>${commercialLens==='credit'?`<td><span class="credit-score ${pay==='26'?'bad':''}">${pay}</span></td><td>${days}</td><td>${out}</td>`:commercialLens==='opportunity'?`<td>${chk==='—'?'—':`<span class="score">${chk}</span>`}</td><td>${card==='—'?'—':`<span class="score">${card}</span>`}</td><td><span class="book-source">Saved model row</span></td>`:`<td><span class="tone-dot ${t.includes('Negative')?'negative':'unknown'}"></span>${t}</td><td>${pay==='—'?'—':`PAYDEX ${pay}`}<small class="book-source">${out}</small></td><td>${chk==='—'?'Commercial card':`${chk} checking`}</td>`}</tr>`).join('')}</tbody></table></div><div class="book-foot">Selected Nov 11 fixtures · missing values remain unavailable · model probability is not offer approval</div>`;
 document.querySelectorAll('[data-company-lens]').forEach(b=>b.onclick=()=>{commercialLens=b.dataset.companyLens;renderCompanyBook()});
 root.querySelectorAll('[data-company]').forEach(b=>b.onclick=()=>{const i=queue().findIndex(r=>r.name===b.dataset.company);if(i>=0)selectRow(i)});
}
function bindComposition(){
 bindOpen();document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{const i=queue().findIndex(r=>r.name===b.dataset.person);if(i>=0){selectRow(i);document.getElementById('inspector').scrollIntoView({behavior:'smooth',block:'nearest'})}});
 document.querySelectorAll('[data-review-metric]').forEach(b=>b.onclick=()=>{const [title,value,meta,kind,explanation]=reviewedWealthMetrics[+b.dataset.reviewMetric];showDialog(title,`<p class="dialog-copy"><strong>${value}</strong> · ${meta}</p><p class="dialog-copy">${explanation}</p><p class="study-disclaimer">Deployed Wealth app · Jose Sifontes · My book · read-only browser capture Nov 12, 2026. Static study content, not a live browser query.</p>`)});
 document.querySelectorAll('[data-intel]').forEach(b=>b.onclick=()=>showDialog(b.dataset.intel+' · Company Intel',`<p class="dialog-copy">Keep ${esc(current().name)} selected and open the existing Commercial Company Intel workflow. Preserve ZoomInfo firmographics, BoardEx governance, MSCI ESG, and SEC filing content. This is a design placement preview; the production tab and backend remain unchanged.</p>`));
 document.querySelectorAll('[data-research]').forEach(b=>b.onclick=()=>openExplorer('intelligence'));
 document.querySelectorAll('[data-directory]').forEach(b=>b.onclick=()=>{const [title,body]=sectionCatalog[persona][+b.dataset.directory];showDialog(title+' · existing sections',`<p class="dialog-copy">${body}</p><div class="coverage">${body.split(', ').map(x=>`<p><strong>${esc(x.replace(/\.$/,''))}</strong>Retain the existing data, actions, and detail workflow. The standalone study explores its placement.</p>`).join('')}</div>`)});
}
document.getElementById('about').onclick=()=>showDialog('Study 03 — Three different working environments',`<div class="coverage"><p><strong>Retail · Relationship desk</strong>A customer-needs workspace with a work lane, central conversations, customer context, and pipeline below. Warm ivory, ink blue, coral, ochre, and restrained teal replace the green wash.</p><p><strong>Wealth · Advisory atelier</strong>A horizontal capital ribbon and a household review environment with advisory lenses. Plans, concentration, and relationship work have distinct ways to explore the same evidence. Parchment, bronze, and ink remain.</p><p><strong>Commercial · Relationship exchange</strong>A company intelligence table with relationship, credit, and product lenses; company context sits beside it, with execution and market coverage below. Navy, cool blue, cyan accents, and amber risk context.</p></div><p class="dialog-copy">Historical and captured data remain explicitly scoped. All production functionality and backend wiring remain required. No production source or metadata was changed.</p><p class="dialog-copy"><a href="v2.html">Compare Study 02 ↗</a> &nbsp; <a href="v1.html">Study 01 ↗</a></p>`);
render();
