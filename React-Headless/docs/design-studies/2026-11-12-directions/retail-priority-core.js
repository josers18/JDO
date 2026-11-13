/* Mirrors the current priorityQueue / Who-to-Call contracts over dated captures.
   Identity adaptation: dedupe by AccountId + action; retain known IDs on derived items. */
globalThis.retailPriorityCore=(()=>{
 const labels={'INV-ACQ':'Investing','HYS-ACQ':'Savings','HEL-ACQ':'HELOC','AUTO-ACQ':'Auto Loan','MTG-30':'Mortgage','CRC-ACQ':'Credit Card','CHK-ACQ':'Checking','PL-ACQ':'Personal Loan'};
 const dayOffset=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const tier=(due,now)=>!due?'watch':due<=now?'today':due<=dayOffset(now,7)?'week':'watch';
 const dueFrom=(date,days,now)=>{const due=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?dayOffset(date,days):now;return due>now?due:now;};
 const money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1});
 function whoItem(r,now){
  const drivers=[];
  if(r.csat!=null)drivers.push({label:'CSAT',points:.3*(70-r.csat)/50,text:`CSAT ${r.csat}${r.nps!=null?' · survey recommendation '+r.nps+'/10':''}`,action:'Service-recovery outreach'});
  if(r.deal_risk!=null)drivers.push({label:'Gong',points:.3*r.deal_risk/100,text:`${r.sentiment} & declining calls · deal risk ${r.deal_risk}`,action:'Relationship save call'});
  if(r.months_high!=null)drivers.push({label:'Stress',points:.25*r.months_high/6,text:`${r.months_high} High-stress observations`,action:'Support check-in'});
  if(r.conv!=null)drivers.push({label:'Offer',points:.15*Math.min(1,r.conv/50),text:`${r.conv}% modeled conversion · ${labels[r.offer_code]||r.offer_code}`,action:'Explore the next customer need'});
  drivers.sort((a,b)=>b.points-a.points);
  const risk=drivers.filter(d=>d.label!=='Offer').length;
  return {key:'who:'+r.account_id,account:r.account_id,name:r.name,action:drivers[0]?.action||'Customer check-in',reason:drivers.map(d=>d.text).join(' · '),score:r.score,severity:risk>=2||r.csat!=null&&r.csat<=30||r.sentiment==='Very Negative'?'high':risk?'medium':'low',source:'Who-to-Call · CSAT / Gong / Claritas / offers',sourceDate:now,drivers,kind:'Relationship care',approach:'Start with the customer’s current concerns, review the source evidence, and agree on a useful next step.'};
 }
 function blend({primary=[],opportunities=[],tasks=[],now,limit=8}){
  if(limit<=0)return [];
  const out=primary.map((r,i)=>{const dueDate=r.dueDate||dayOffset(now,{high:0,medium:2,low:5}[r.severity]+i%2);return {...r,dueDate,tier:tier(dueDate,now)};});
  opportunities.filter(o=>o.account&&o.name&&Number.isFinite(o.propensity)).slice(0,5).forEach(o=>{
   const stage=(o.stage||'').toLowerCase();
   const action=stage.includes('renew')?'Policy / relationship renewal':/clos|fund/.test(stage)?'Confirm docs & set funding date':/propos|quote/.test(stage)?'Follow up to close proposal':stage.includes('negoti')?'Advance negotiation':'Cross-sell — advance '+(o.stage||'deal');
   const dueDate=o.closeDate||dayOffset(now,14);
   out.push({key:'opportunity:'+o.id,recordId:o.id,recordKind:'opportunity',account:o.account,name:o.name,action,reason:`${money(o.amount)} ${o.stage||'open'} · ${Math.round(o.propensity*100)}% likely`,score:Math.min(1,o.propensity*.7+Math.min(o.amount/3000000,1)*.3),severity:o.propensity>=.7||o.amount>=1000000?'high':o.propensity>=.4||o.amount>=250000?'medium':'low',source:'Open opportunity',sourceDate:o.sourceDate||'2026-11-12',dueDate,tier:tier(dueDate,now)});
  });
  tasks.filter(t=>t.account&&/^\d{4}-\d{2}-\d{2}/.test(t.date||'')).slice(0,4).forEach(t=>{
   const escalation=(t.priority||'').toLowerCase()==='high'||/escalat|declin|complaint|dispute|fraud|urgent|overdue|breach|churn/i.test(t.title);
   out.push({key:'task:'+t.id,recordId:t.id,recordKind:'task',account:t.account,name:t.name,action:escalation?'Escalation — resolve today':'Complete overdue follow-up',reason:t.title,score:escalation?.9:.55,severity:escalation?'high':'medium',source:'Overdue task',sourceDate:'2026-11-12',dueDate:t.date.slice(0,10),tier:'today'});
  });
  const seen=new Set(),unique=out.filter(r=>{const k=r.account+'|'+r.action;if(!r.account||seen.has(k))return false;seen.add(k);return true;});
  const rank={high:0,medium:1,low:2},sort=(a,b)=>b.score-a.score||rank[a.severity]-rank[b.severity];unique.sort(sort);
  const top=unique.slice(0,limit),reserved=unique.find(r=>r.reserveSlot);
  if(reserved&&!top.some(r=>r.reserveSlot)&&top.length===limit)top[limit-1]=reserved;
  return top.sort(sort);
 }
 function firstMove({who=[],browsing=[],snoozed=[],asOf}){
  const recent=browsing.filter(r=>{const age=new Date(asOf)-new Date(r.lastSeen);return Number.isFinite(age)&&age>=0&&age<=2*86400000;});
  return [...recent,...who].find(r=>!snoozed.includes(r.key))||null;
 }
 const netWeek=row=>row?{...row,net:Math.round((Number(row.credits)-Number(row.debits))*100)/100}:null;
 return {whoItem,blend,firstMove,tier,dueFrom,dayOffset,netWeek};
})();
