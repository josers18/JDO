/* Retail signal identity, source boundaries and hazard cohorts. No CRM mutations. */
globalThis.retailWatchCore=(()=>{
 const families={aml:'Screening changes',gong:'Call sentiment',inflows:'Cash moments',campaigns:'Marketing engagement',liquidity:'Life transitions'};
 const provenance=['signalKey','signalAccountId','signalFamily','signalDate','sourceSystem','externalRecordId'];
 const account=(D,id)=>(D.accounts||[]).find(a=>a.Id===id&&a.OwnerId===D.ownerId);
 const rows=(D,k)=>D.sources?.[k]?.state==='captured'?D.datasets?.[k]||[]:[];
 const sourceState=(D,k)=>D.sources?.[k]?.state!=='captured'?'unavailable':rows(D,k).length?'captured':'empty';
 function freshness(date,asOf,allowance=3){const t=Date.parse(date),a=Date.parse(asOf);if(date==null||!Number.isFinite(t)||!Number.isFinite(a))return {state:'unavailable',days:null};const age=Math.floor((a-t)/86400000);return {state:age<0?'future':age>allowance?'stale':'current',days:age};}
 const flag=v=>v===true?'Flag recorded':v===false?'No flag recorded':'Unavailable';
 const escalated=r=>{const n={Low:1,Medium:2,High:3,Severe:4};if(r.change_type==='New')return ['High','Severe'].includes(r.risk_rating);if(r.change_type==='Changed')return r.risk_rating==='Severe'&&r.prev_rating!=='Severe'||r.risk_rating==='High'&&!['High','Severe'].includes(r.prev_rating)||r.risk_rating==='Medium'&&(r.prev_rating??'Low')==='Low';if(r.change_type)return false;return r.prev_rating==null?['High','Severe'].includes(r.risk_rating):n[r.risk_rating]>n[r.prev_rating];};
 function make(D,family,r,id,date,headline,reason,action,source,extra={}){const a=account(D,id);if(!a)return null;return {key:JSON.stringify([family,id,String(date||''),extra.externalRecordId||r.campaign||r.description||'']),family,account:id,name:a.Name,date:date||null,headline,reason,action,source,raw:r,...extra};}
 function inbox(D){return [
 ...rows(D,'aml').filter(escalated).map(r=>make(D,'aml',r,r.account_id,r.screened,(r.prev_rating||(r.change_type==='New'?'First screening':'Prior rating unavailable'))+' → '+r.risk_rating,'Recorded screening escalation; review through the established compliance process.','Review screening change','WorldCheck',{severity:['High','Severe'].includes(r.risk_rating)?'high':'medium',externalRecordId:r.case_ref,allowance:3})),
 ...rows(D,'gong').map(r=>make(D,'gong',r,r.account_id,r.period,r.sentiment+' · '+(r.trend||'Declining'),'Recorded call tone is negative and declining. Confirm the customer’s current experience.','Prepare relationship check-in','Gong',{severity:'medium',allowance:10})),
 ...rows(D,'inflows').map(r=>make(D,'inflows',r,r.account_id,r.tx_date,/TAX REF/i.test(r.description)?'Tax refund received':'Bonus received',r.description||'Recorded qualifying credit','Discuss plans for this cash','Financial transactions',{severity:'low',allowance:7})),
 ...rows(D,'campaigns').map(r=>make(D,'campaigns',r,r.account_id,r.last_at,r.product||'Campaign interest',r.campaign,'Ask about '+(r.product||'campaign')+' interest','Marketing_Engagements',{severity:'low',allowance:3})),
 ...rows(D,'liquidity').map(r=>make(D,'liquidity',r,r.person_account_id__c,r.detected_date__c,'Employer departure · liquidity flag',r.employer_name__c||r.new_employer_name__c||'Recorded employer change','Understand the life transition','UserGems',{severity:'medium',allowance:180}))
 ].filter(Boolean);}
 const forAccount=(D,id)=>inbox(D).filter(r=>r.account===id);
 function hazards(r){const values=['homes','flood','wildfire','both_hazards'].map(k=>r?.[k]);if(values.some(v=>v==null))return null;const [homes,flood,fire,both]=values.map(Number);return {floodOnly:flood-both,fireOnly:fire-both,both,union:flood+fire-both,consistent:homes===flood+fire-both&&both>=0&&both<=Math.min(flood,fire)};}
 function propertyMatch(r,cohort){const flood=['A','AE','V','VE'].includes(r.flood_zone),fire=r.wildfire!=null&&Number(r.wildfire)>=70;return cohort==='all'?flood||fire:cohort==='both'?flood&&fire:cohort==='flood'?flood&&!fire:cohort==='fire'?fire&&!flood:false;}
 function aggregate(rs,k){const n=rs?.[0]?.[k];return n==null||n===''||!Number.isFinite(Number(n))?null:Number(n);}
 function linkedDraft(input){const d={...input};if(d.signalAccountId&&d.accountId!==d.signalAccountId)for(const k of provenance)delete d[k];return d;}
 function serviceItem(r,D){const a=account(D,r.account);return a?{key:JSON.stringify(['service',r.account,r.case_id]),account:r.account,name:a.Name,family:'service',source:'ServiceNow',date:r.modified||r.created||null,headline:r.subject||'External service case',reason:r.status,action:'Coordinate external service follow-up',externalRecordId:r.case_id,raw:r,allowance:30}:null;}
 function propertyItem(r,D){const a=account(D,r.account_id);return a?{key:JSON.stringify(['property',r.account_id,r.period]),account:r.account_id,name:a.Name,family:'property',source:'CoreLogic',date:r.period,headline:'Property exposure to review',reason:(r.flood_zone||'Unavailable')+' flood zone · wildfire index '+(r.wildfire??'unavailable'),action:'Review property context with customer',raw:r,allowance:100}:null;}
 function plotPoint(r){return r.value!=null&&r.wildfire!=null&&Number.isFinite(Number(r.value))&&Number.isFinite(Number(r.wildfire))?{value:Number(r.value),wildfire:Number(r.wildfire)}:null;}
 return {plotPoint,families,provenance,account,rows,sourceState,freshness,flag,escalated,inbox,forAccount,hazards,propertyMatch,aggregate,linkedDraft,serviceItem,propertyItem};
})();
