const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const c={};vm.createContext(c);
for(const f of ['retail-priority-data.js','retail-priority-core.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),c);
const core=c.retailPriorityCore,now='2026-11-13';
test('captured Who-to-Call preserves source score and drivers without a false six-month label',()=>{
 const row=vm.runInContext('retailPriorityData.datasets.who[1]',c),item=core.whoItem(row,now);
 assert.equal(item.score,row.score);assert.equal(item.account,row.account_id);assert(item.reason.includes('7 High-stress observations'));assert(!item.reason.includes('7 of 6'));
});
test('queue deduplicates exact customer/action while preserving duplicate names',()=>{
 const rows=core.blend({primary:[{key:'a',account:'1',name:'Same Name',action:'Call',score:.7,severity:'high'},{key:'b',account:'1',name:'Same Name',action:'Call',score:.7,severity:'high'},{key:'c',account:'2',name:'Same Name',action:'Call',score:.6,severity:'medium'}],now});
 assert.equal(rows.length,2);
});
test('reserve slot keeps the strongest eligible liquidity item',()=>{
 const primary=Array.from({length:10},(_,i)=>({key:'risk'+i,account:'a'+i,name:'Name '+i,action:'Call',score:.99-i*.01,severity:'high'}));
 primary.push({key:'liquidity',account:'p',name:'P',action:'Liquidity',score:.2,severity:'medium',reserveSlot:true});
 const rows=core.blend({primary,now});assert.equal(rows.length,8);assert(rows.some(r=>r.key==='liquidity'));
});
test('due buckets use the pinned capture day and retain actual dates',()=>{
 assert.equal(core.tier('2024-07-15',now),'today');assert.equal(core.tier('2026-11-16',now),'week');assert.equal(core.tier('2026-12-01',now),'watch');
});
test('first move favors a recent browser, then Who-to-Call; snoozing does not mutate sources',()=>{
 const who=[{key:'risk',score:.8}],browsing=[{key:'browse',lastSeen:'2026-11-12T12:00:00Z'}],asOf='2026-11-13T17:00:00Z';
 assert.equal(core.firstMove({who,browsing,asOf,snoozed:[]}).key,'browse');assert.equal(core.firstMove({who,browsing,asOf,snoozed:['browse']}).key,'risk');
 assert.equal(core.firstMove({who,browsing:[],asOf,snoozed:['risk']}),null);assert.equal(browsing.length,1);
});
test('future timestamps and stale browsing do not become current first moves',()=>{
 const who=[{key:'risk'}];for(const lastSeen of ['2026-11-14T00:00:00Z','2026-11-01T00:00:00Z'])assert.equal(core.firstMove({who,browsing:[{key:'browse',lastSeen}],asOf:'2026-11-13T17:00:00Z'}).key,'risk');
});
test('weekly pulse uses credits minus debits and keeps missing data unavailable',()=>{
 assert.equal(core.netWeek({credits:736132.06,debits:726906.96}).net,9225.10);assert.equal(core.netWeek(null),null);
});
test('ordinary queue ordering matches the actual production blender',()=>{
 const ts=require(path.resolve(__dirname,'../../../../force-app/main/default/uiBundles/ReactRetail/node_modules/typescript'));
 const src=fs.readFileSync(path.resolve(__dirname,'../../../../force-app/main/default/uiBundles/_shared/src/data/priorityQueue.ts'),'utf8');
 const pc={exports:{},require:()=>({localIsoDate:(d,days=0)=>{const n=new Date(d.getFullYear(),d.getMonth(),d.getDate()+days);return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;}})};
 vm.createContext(pc);vm.runInContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,pc);
 const primary=[{key:'a',account:'1',name:'A',action:'Call',reason:'Source reason',score:.7,severity:'high'},{key:'b',account:'2',name:'B',action:'Check',reason:'Other source',score:.5,severity:'medium',dueDate:'2026-11-18'}];
 const opportunities=[{id:'op1',account:'3',name:'C',stage:'Proposal Issued',amount:700000,propensity:.6,closeDate:'2026-12-01'}];
 const tasks=[{id:'task1',account:'4',name:'D',title:'Resolve complaint',date:'2026-04-20',priority:'High'}];
 const expected=pc.exports.buildPriorityQueue({primary:primary.map(r=>({...r,id:r.key,clientId:r.account,clientName:r.name,segment:'Retail',source:'Captured source',relationshipValue:0})),opportunities:opportunities.map(r=>({...r,clientName:r.name})),tasks:tasks.map(r=>({...r,time:r.date,clientName:r.name,whatId:r.account})),now:new Date(2026,10,13)});
 const actual=core.blend({primary,opportunities,tasks,now});assert.deepEqual(actual.map(r=>[r.name,r.action,r.score,r.dueDate,r.tier]),Array.from(expected,r=>[r.clientName,r.action,r.score,r.dueDate,r.tier]));
});

test('a missing opportunity probability never produces a NaN ranking',()=>{
 const q=core.blend({now,opportunities:[{id:'unknown',account:'1',name:'A',amount:1000,stage:'Prospecting',propensity:NaN}],tasks:[{id:'t',account:'2',name:'B',title:'Resolve complaint',date:'2026-11-01',priority:'High'}]});assert.equal(q.length,1);assert.equal(q[0].key,'task:t');assert(Number.isFinite(q[0].score));
});
