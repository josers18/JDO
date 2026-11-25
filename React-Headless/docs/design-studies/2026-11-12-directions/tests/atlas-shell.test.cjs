const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../atlas-shell-core.js');
test('search keeps native name token AND, four tokens, and six per object',()=>{
 assert.deepEqual(C.tokens(`  Jo'se \\ "Morris" third fourth fifth `),['jose','morris','third','fourth']);
 const records={Account:Array.from({length:9},(_,i)=>({Id:'001'+i,Name:'Julie E Morris'})),Contact:[{Id:'003a',Name:'Morris Julie'}],Lead:[{Id:'00Qa',Name:'Julie Morris',IsConverted:true}],Opportunity:[{Id:'006a',Name:'Julie retirement'}]};
 assert.deepEqual(C.search(records,'j'),[]);
 const groups=C.search(records,'Julie Morris');assert.equal(groups.find(g=>g.object==='Account').rows.length,6);assert.equal(groups.find(g=>g.object==='Contact').rows.length,1);assert.equal(groups.some(g=>g.object==='Lead'),false);assert.equal(groups.some(g=>g.object==='Opportunity'),false);
});
test('record types and identical names never collapse identities',()=>{
 const r=C.search({Account:[{Id:'001a',Name:'Same Person'},{Id:'001b',Name:'Same Person'}],Contact:[{Id:'003a',Name:'Same Person'}]},'same');
 assert.deepEqual(r.flatMap(g=>g.rows.map(r=>r.Id)),['001a','001b','003a']);
});
test('notification criteria retain native High only and overdue open opportunities',()=>{
 const alerts=C.alerts([{Id:'500a',Priority:'High',IsClosed:false},{Id:'500b',Priority:'Critical',IsClosed:false},{Id:'500c',Priority:'High',IsClosed:true}],[{Id:'006a',IsClosed:false,CloseDate:'2026-01-01'},{Id:'006b',IsClosed:false,CloseDate:'2026-11-20'},{Id:'006c',IsClosed:false,CloseDate:'2026-11-21'},{Id:'006d',IsClosed:true,CloseDate:'2026-01-01'}],'2026-11-13');
 assert.deepEqual(alerts.map(r=>r.Id),['500a','006a','006b']);
});
test('View As without a matching capture never reuses the original book',()=>{
 assert.equal(C.canRenderBook('005jose','005jose'),true);assert.equal(C.canRenderBook('005allen','005jose'),false);assert.equal(C.canRenderBook(null,'005jose'),false);
});
test('full Salesforce search retains the Unicode-safe Aura route and setup endpoints',()=>{
 const urls=C.urls('https://example.demo.my.salesforce.com');
 assert.equal(urls.setup,'https://example.demo.my.salesforce-setup.com/lightning/setup/SetupOneHome/home');assert.equal(urls.dataCloud,urls.setup+'?setupApp=audience360');assert.equal(urls.settings,'https://example.demo.my.salesforce.com/lightning/settings/personal/PersonalInformation/home');
 const full=C.searchUrl(urls.core,'José Morris');const hash=full.split('#')[1];const payload=JSON.parse(Buffer.from(hash,'base64').toString());assert.equal(payload.attributes.term,'José Morris');assert.equal(payload.componentDef,'forceSearch:searchPageDesktop');
});
