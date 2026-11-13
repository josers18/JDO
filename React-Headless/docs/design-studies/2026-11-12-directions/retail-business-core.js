/* Pure selectors over the captured Retail business-development contracts. */
globalThis.retailBusinessCore=(()=>{
 const columns={
  'CHK-ACQ':{label:'Checking',owned:/^(?!.*(?:Business|Commercial|Corporate)).*Checking/i,plaid:['Checking']},
  'HYS-ACQ':{label:'Savings',owned:/^(?!.*(?:Business|Commercial|Corporate)).*(?:Savings|Money Market|\bCD\b)/i,plaid:['Savings','Money Market']},
  'CRC-ACQ':{label:'Credit Card',owned:/^(?!.*(?:Business|Commercial|Corporate)).*Card/i,plaid:['Credit Card']},
  'AUTO-ACQ':{label:'Auto Loan',owned:/Auto Loan/i,plaid:['Auto Loan']},
  'MTG-30':{label:'Mortgage',owned:/Mortgage|\bARM\b/i,plaid:['Mortgage']},
  'HEL-ACQ':{label:'HELOC',owned:/HELOC/i,plaid:['Line of Credit']},
  'PL-ACQ':{label:'Personal Loan',owned:/Personal Loan/i,plaid:[]},
  'INV-ACQ':{label:'Investing',owned:/Brokerage|\bIRA\b|Managed|529/i,plaid:['Brokerage','IRA','401k','Managed Portfolio']}
 };
 const ordered=rows=>[...new Set(rows.map(r=>r.acct))];
 const introKey=r=>r.src_id+'>'+r.dst_id+':'+String(r.discovered).slice(0,10);
 function introPrefill(r){
  const name=r.dst_name||'',household=/^(.+) Household$/.exec(name),person=household||/^[A-Z][a-z'-]+(?: [A-Z]\.?)? [A-Z][A-Za-z'-]+$/.test(name),parts=name.split(' ');
  return {firstName:household?'':person?parts.slice(0,-1).join(' '):'',lastName:household?household[1]:person?parts.at(-1):'',company:name,status:'New',leadSource:'Referral',email:'',annualRevenue:'',introductionKey:introKey(r),referrerAccountId:r.src_id,targetAccountId:r.dst_id};
 }
 function leadErrors(d){const errors=[];if(!String(d.lastName||'').trim())errors.push('Last name is required.');if(!String(d.company||'').trim())errors.push('Company is required.');if(d.annualRevenue!=null&&d.annualRevenue!==''&&(!Number.isFinite(Number(d.annualRevenue))||Number(d.annualRevenue)<0))errors.push('Annual revenue must be a non-negative number or blank.');if(d.original&&!/^00Q[A-Za-z0-9]{12,15}$/.test(d.original))errors.push('An existing Lead requires its exact Lead ID.');return errors;}
 function gridSelection(topRows,holderRows){const top=ordered(topRows),reserved=ordered(holderRows).filter(id=>!top.includes(id)).slice(0,3);return {ids:[...top.slice(0,12-reserved.length),...reserved],reserved};}
 function owned(holdings,account,code){const pattern=columns[code]?.owned;return !!pattern&&holdings.some(r=>(r.FinServ__PrimaryOwner__c||r.account)===account&&!/closed/i.test(r.FinServ__Status__c||r.status||'')&&pattern.test(r.Name||r.name||''));}
 function movers(D,dir,stage='all'){const grid=gridSelection(D.datasets.whitespace,D.datasets.holderOffers).ids;return (D.datasets[dir]||[]).filter(r=>!grid.includes(r.acct)&&r.action_rank!=null&&r.ev>0&&(dir==='rising'?r.moved>=2||r.ev_moved>=250:r.moved<=-2||r.ev_moved<=-250)).slice(0,25).filter(r=>!owned(D.crm.holdings,r.acct,r.code)).filter(r=>stage==='all'||r.stage===stage);}
 function heldAway(D,account,code){const types=columns[code]?.plaid||[];return [...D.datasets.plaid].filter(r=>r.acct===account&&types.includes(r.type)&&r.balance>0).sort((a,b)=>b.balance-a.balance)[0]||null;}
 function history(D,account,code){return D.datasets.history.filter(r=>r.acct===account&&r.code===code).map(r=>({account,code,period:String(r.mo).slice(0,10),probability:r.conv,scoremove:r.moved,valuemove:r.ev_moved})).sort((a,b)=>a.period.localeCompare(b.period));}
 function normalize(r){return {account:r.acct,name:r.name,code:r.code,rank:r.action_rank,probability:r.conv,value:r.ev,channels:r.channels,stage:r.stage,period:r.mo?String(r.mo).slice(0,10):null,em_p:r.em_p,cc_p:r.cc_p,scoremove:r.moved,valuemove:r.ev_moved};}
 function offers(D){const map=new Map();for(const r of [...D.datasets.whitespace,...D.datasets.holderOffers,...D.datasets.rising,...D.datasets.falling]){const key=r.acct+':'+r.code;if(!map.has(key))map.set(key,normalize(r));}return [...map.values()];}
 function existingOpportunity(D,account,code){const label=columns[code]?.label;return D.crm.openOpportunities.find(r=>r.AccountId===account&&r.Name.split(' — ')[0]===label)||null;}
 function tenure(r){if(r.property_period==null||r.is_owner==null)return 'unknown';if(r.is_owner===false)return 'renter';return Number(r.balance)>0?'mortgaged':'owner';}
 function mortgageSelection(D){const excluded=new Set(D.datasets.equity.map(r=>r.account_id)),kept=D.datasets.mortgage.filter(r=>!excluded.has(r.account_id)),out=[];for(const bucket of [0,1,2]){const r=(bucket===0?kept.find(r=>tenure(r)==='renter'):null)||kept.find(r=>Number(r.tenure)===bucket);if(r)out.push(r);}for(const r of kept){if(out.length>=3)break;if(!out.some(a=>a.account_id===r.account_id))out.push(r);}return out.slice(0,3);}
 function linkedDraft(kind,input){const r={...input};if(r.offerAccountId&&r.accountId!==r.offerAccountId){delete r.offerAccountId;delete r.offerCode;}if(kind!=='lead'&&r.referrerAccountId&&r.accountId!==r.referrerAccountId){delete r.introductionKey;delete r.referrerAccountId;delete r.targetAccountId;}return r;}
 function aggregate(rows,key){const v=rows?.[0]?.[key];return v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);}
 return {aggregate,linkedDraft,columns,introKey,introPrefill,leadErrors,gridSelection,owned,movers,heldAway,history,normalize,offers,existingOpportunity,tenure,mortgageSelection};
})();
