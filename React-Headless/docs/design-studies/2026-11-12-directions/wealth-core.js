/* Pure Wealth evidence rules. No source calculation or inferred client identity. */
globalThis.wealthCore=(()=>{
 const funds=new Set(['SPY','QQQ','VTI','VXUS','AGG','BND','HYG','LQD','TIP','MUB','VNQ','GLD','SPAXX','VMFXX']);
 const number=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const rows=(s,owner)=>s?.status==='available'&&s.scope==='book'&&s.ownerId===owner&&Array.isArray(s.rows)?s.rows:[];
 function selectOffers(sources,id,allow){if(!allow.has(id))return [];const m=new Map();for(const s of sources)for(const r of s.rows||[])if(r.account===id&&!m.has(r.code))m.set(r.code,{...r,captureSource:s.label});return [...m.values()].sort((a,b)=>(a.rank??999)-(b.rank??999));}
 function prepare(data){const d={...data};if(d.offerAccountId&&d.offerAccountId!==d.accountId){delete d.offerCode;delete d.offerAccountId;d.contextReviewRequired=true;}if(d.sourceAccountId&&d.sourceAccountId!==d.accountId||d.provenance?.accountId&&d.provenance.accountId!==d.accountId){for(const k of ['sourceAccountId','sourceKey','sourceKind','provenance','financialPlanId','goalId'])delete d[k];d.contextReviewRequired=true;}return d;}
 function planMode(p,mode,today){if(p.status==='Draft'||p.plan_status==='Draft')return false;const success=number(p.success);const next=String(p.next_review||p.review||'').slice(0,10),end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+30);return mode==='critical'?success!=null&&success<50:mode==='risk'?success!=null&&success<70:mode==='stale'?Number(p.stale)===1:mode==='due'?next>=today&&next<=end.toISOString().slice(0,10):true;}
 const concentrated=r=>!funds.has(r.ticker)&&number(r.tot)>0&&number(r.mv)!=null&&Number(r.mv)/Number(r.tot)>=.2;
 const history=(rows,o)=>rows.filter(h=>h.account===o.account&&h.code===o.code).sort((a,b)=>a.period.localeCompare(b.period));
 const exact=(rows,id,key='account_id')=>rows.filter(r=>r[key]===id);
 return {number,rows,selectOffers,prepare,planMode,concentrated,history,exact};
})();
