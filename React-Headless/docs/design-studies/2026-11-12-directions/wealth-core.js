/* Pure Wealth evidence rules. No source calculation or inferred client identity. */
globalThis.wealthCore=(()=>{
 const funds=new Set(['SPY','QQQ','VTI','VXUS','AGG','BND','HYG','LQD','TIP','MUB','VNQ','GLD','SPAXX','VMFXX']);
 const number=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const rows=(s,owner)=>s?.status==='available'&&s.scope==='book'&&s.ownerId===owner&&Array.isArray(s.rows)?s.rows:[];
 function selectOffers(sources,id,allow){if(!allow.has(id))return [];const m=new Map();for(const s of sources)for(const r of s.rows||[])if(r.account===id&&!m.has(r.code))m.set(r.code,{...r,captureSource:s.label});return [...m.values()].sort((a,b)=>(a.rank??999)-(b.rank??999));}
 function prepare(data){const d={...data};if(typeof d.provenance==='string'){try{d.provenance=JSON.parse(d.provenance);}catch{delete d.provenance;d.contextReviewRequired=true;}}if(d.offerAccountId&&d.offerAccountId!==d.accountId){delete d.offerCode;delete d.offerAccountId;d.contextReviewRequired=true;}if(d.sourceAccountId&&d.sourceAccountId!==d.accountId||d.provenance?.accountId&&d.provenance.accountId!==d.accountId){for(const k of ['sourceAccountId','provenance','financialPlanId','goalId','introductionKey','referrerAccountId','targetAccountId',...(!d.sourceRecordId||!['Event','Task'].includes(d.sourceKind)?['sourceKey','sourceKind']:[])])delete d[k];d.contextReviewRequired=true;}return d;}
 function planMode(p,mode,today){if(p.status==='Draft'||p.plan_status==='Draft')return false;const success=number(p.success);const next=String(p.next_review||p.review||'').slice(0,10),end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+30);return mode==='critical'?success!=null&&success<50:mode==='risk'?success!=null&&success<70:mode==='stale'?Number(p.stale)===1:mode==='due'?next>=today&&next<=end.toISOString().slice(0,10):true;}
 const concentrated=r=>!funds.has(r.ticker)&&number(r.tot)>0&&number(r.mv)!=null&&Number(r.mv)/Number(r.tot)>=.2;
 const history=(rows,o)=>{const byMonth=new Map();for(const h of rows)if(h.account===o.account&&h.code===o.code&&!byMonth.has(h.period))byMonth.set(h.period,h);return [...byMonth.values()].sort((a,b)=>a.period.localeCompare(b.period));};
 const exact=(rows,id,key='account_id')=>rows.filter(r=>r[key]===id);
 const accountKey=r=>r?.account_id||r?.AccountId||r?.account||r?.acct||r?.person_account_id__c||r?.account_id__c||r?.Id||r?.dst_id;
 const existingGridOpportunity=(records,accountId,productName)=>records.find(r=>r.AccountId===accountId&&r.LeadSource==='Cross-sell grid'&&r.IsClosed===false&&String(r.Name||'').startsWith(productName+' — '));

 const owned=(holdings,code)=>{const p={'PCHK-ACQ':/Premier Checking/i,'WM-CASH':/High-Yield|Money Market|\bCD\b/i,'WM-MAS':/Managed/i,'IRA-RTH':/Roth/i,'IRA-ROL':/Traditional IRA|Rollover/i,'MTG-JMB':/Mortgage|\bARM\b/i,'HEL-ACQ':/HELOC/i}[code];return !!p&&holdings.some(h=>h.FinServ__Status__c!=='Closed'&&p.test(h.Name||''));};return {number,rows,selectOffers,prepare,planMode,concentrated,history,exact,owned,accountKey,existingGridOpportunity};
})();
