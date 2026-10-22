import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CaseStore, fictionalCase, createCase, checkEvidence, draftComplaint } from './core.js';
test('complete case and draft survive a fresh store instance; cases remain isolated',()=>{const dir=mkdtempSync(join(tmpdir(),'sir-test-'));try{const s=new CaseStore(dir);const c=fictionalCase();assert.equal(checkEvidence(c).ready,true);c.draft=draftComplaint(c);s.save(c);const other=fictionalCase();s.save(other);assert.deepEqual(new CaseStore(dir).get(c.id),c);assert.equal(s.get(other.id).draft,null);}finally{rmSync(dir,{recursive:true,force:true})}});
test('missing cancellation blocks unsupported drafting',()=>{const c=fictionalCase();c.evidence=c.evidence.filter(e=>e.type!=='cancellation');assert.equal(checkEvidence(c).ready,false);assert.throws(()=>draftComplaint(c),/missing/)});
test('missing receipt blocks drafting',()=>{const c=fictionalCase();c.evidence=c.evidence.filter(e=>e.type!=='receipt');assert.throws(()=>draftComplaint(c),/missing/)});
test('conflicting dates and amounts block drafting',()=>{for(const change of [c=>c.cancelled='2026-09-27',c=>c.amount='99.00',c=>c.currency='USD',c=>c.charged='2026-10-06']){const c=fictionalCase();change(c);assert.throws(()=>draftComplaint(c),/conflict/)}});
test('invalid and out of order dates block drafting',()=>{const c=fictionalCase();c.cancelled='2026-02-30';assert.throws(()=>draftComplaint(c),/invalid/);c.cancelled='2026-10-05';c.evidence[0].date=c.cancelled;assert.throws(()=>draftComplaint(c),/not after/)});
test('draft references evidence and requests review without asserting a legal right',()=>{const draft=draftComplaint(fictionalCase());assert.match(draft,/\[E1\]/);assert.match(draft,/\[E2\]/);assert.match(draft,/refund it if it was taken in error/);assert.match(draft,/Nothing has been sent/)});
test('case IDs cannot escape the data directory',()=>{const dir=mkdtempSync(join(tmpdir(),'sir-test-'));try{assert.throws(()=>new CaseStore(dir).get('../secret'),/Invalid/)}finally{rmSync(dir,{recursive:true,force:true})}});
test('saved case discovery and edited draft survive an entirely new Node process',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sir-test-'));
  try {
    const store=new CaseStore(dir);const c=store.save(fictionalCase());
    store.saveDraft(c.id,draftComplaint(c),0);
    const edited='My reviewed complaint with an additional request for a written explanation.';
    store.saveDraft(c.id,edited,1);
    const script=`import {CaseStore} from ${JSON.stringify(new URL('./core.js',import.meta.url).href)};const s=new CaseStore(process.argv[1]);const list=s.list();console.log(JSON.stringify({list,case:s.get(list[0].id)}));`;
    const restored=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script,dir],{encoding:'utf8'}));
    assert.equal(restored.list[0].id,c.id);assert.equal(restored.list[0].hasDraft,true);
    assert.equal(restored.case.draft,edited);assert.equal(restored.case.revision,2);
    assert.equal(restored.case.draftHistory.length,2);
    assert.match(restored.case.draftHistory[0].text,/\[E1\]/);
  } finally {rmSync(dir,{recursive:true,force:true})}
});
test('stale edits and invalid draft requests preserve the saved revision',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sir-test-'));
  try {const store=new CaseStore(dir);const c=store.save(fictionalCase());store.saveDraft(c.id,'First edit',0);
    assert.throws(()=>store.saveDraft(c.id,'Stale edit',0),/changed/);
    for(const text of ['', '  ',null,'x'.repeat(20001)])assert.throws(()=>store.saveDraft(c.id,text,1),/draft/);
    assert.equal(store.get(c.id).draft,'First edit');assert.equal(store.get(c.id).revision,1);
  } finally {rmSync(dir,{recursive:true,force:true})}
});
test('existing foundation case files remain discoverable and editable without migration',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sir-test-'));
  try {const store=new CaseStore(dir);const c=fictionalCase();c.draft='Legacy generated draft';store.save(c);
    assert.equal(store.list()[0].revision,0);const saved=store.saveDraft(c.id,'Reviewed legacy draft',0);
    assert.equal(saved.draftHistory[0].text,'Legacy generated draft');assert.equal(saved.revision,1);
  } finally {rmSync(dir,{recursive:true,force:true})}
});
const intake = () => ({merchant:'StreamNest',amount:'14.99',currency:'GBP',cancelled:'2026-09-28',charged:'2026-10-05',evidenceIds:['E1','E2']});
test('intake persists incomplete evidence but blocks unsupported drafting until corrected',()=>{
  const c=createCase({...intake(),evidenceIds:['E2']});assert.equal(c.evidence.length,1);assert.throws(()=>draftComplaint(c),/missing/);
  assert.equal(checkEvidence(createCase(intake())).ready,true);
});
test('editable facts are checked independently against fixed evidence',()=>{
  for(const input of [{amount:'20.00'},{merchant:'Other merchant'},{currency:'USD'},{cancelled:'2026-09-27'},{charged:'2026-09-20'}]){
    const c=createCase({...intake(),...input});assert.equal(checkEvidence(c).ready,false);assert.throws(()=>draftComplaint(c),/conflict/);
  }
});
test('invalid intake never becomes a case',()=>{
  for(const input of [{amount:'-1.00'},{amount:'14.999'},{amount:'0.00'},{merchant:' '},{cancelled:'2026-02-30'},{currency:'INVALID'},{evidenceIds:['unknown']},{evidenceIds:['E1','E1']}])assert.throws(()=>createCase({...intake(),...input}));
});
test('case changes retain drafts, mark stale, reject stale tabs and recover after correction',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sir-test-'));
  try{const s=new CaseStore(dir);const c=s.save(createCase(intake()));s.saveDraft(c.id,draftComplaint(c),0,true);
    const before=s.get(c.id).draft;
    const changed=s.updateDetails(c.id,{...intake(),evidenceIds:['E2']},1);
    assert.equal(changed.draft,before);assert.equal(changed.draftNeedsReview,true);assert.equal(changed.caseHistory.length,1);
    assert.throws(()=>s.saveDraft(c.id,'Old tab',1),/changed/);assert.throws(()=>s.updateDetails(c.id,intake(),1),/changed/);
    assert.throws(()=>draftComplaint(changed),/missing/);
    const restored=s.updateDetails(c.id,intake(),2);
    const generated=s.saveDraft(c.id,draftComplaint(restored),3,true);
    assert.equal(generated.draftNeedsReview,false);assert.equal(generated.draftHistory.length,2);
    assert.equal(new CaseStore(dir).get(c.id).revision,4);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
const customInput=()=>({...intake(),merchant:'DemoVPN',amount:'49.99',currency:'USD',cancelled:'2026-09-06',charged:'2026-10-03',evidence:[
  {id:'E1',type:'cancellation',merchant:'DemoVPN',date:'2026-09-06'},
  {id:'E2',type:'receipt',merchant:'DemoVPN',date:'2026-10-03',amount:'49.99',currency:'USD'}
]});
test('independent fictional evidence supports a different merchant and survives reopening',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sir-test-'));
  try{const s=new CaseStore(dir);const c=s.save(createCase(customInput()));const result=checkEvidence(c);assert.equal(result.ready,true);assert.equal(result.comparisons.length,6);assert.ok(result.comparisons.every(row=>row.match));
    s.saveDraft(c.id,draftComplaint(c),0,true);const reopened=new CaseStore(dir).get(c.id);assert.match(reopened.draft,/Hello DemoVPN/);assert.match(reopened.draft,/USD 49.99/);assert.equal(reopened.evidence[0].merchant,'DemoVPN');
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test('comparison reports precise values and source for conflicting custom evidence',()=>{
  const input=customInput();input.evidence[1].amount='39.99';input.evidence[1].merchant='OtherCo';const c=createCase(input);const result=checkEvidence(c);
  assert.equal(result.ready,false);assert.match(result.issues.join(' '),/case says 49.99; E2 says 39.99/);assert.deepEqual(result.comparisons.find(row=>row.label==='Charge amount'),{label:'Charge amount',claimed:'49.99',recorded:'39.99',source:'E2',match:false});assert.throws(()=>draftComplaint(c),/conflict/);
});
test('malformed custom evidence is rejected; display text is derived from record fields',()=>{
  for(const mutate of [input=>input.evidence[0].date='bad',input=>input.evidence[1].amount='-1.00',input=>input.evidence[1].currency='bad',input=>input.evidence[0].merchant='',input=>input.evidence.push(input.evidence[0]),input=>input.evidence[0].type='receipt']){const input=customInput();mutate(input);assert.throws(()=>createCase(input));}
  const input=customInput();input.evidence[0].text='Unrelated asserted document text';const c=createCase(input);assert.match(c.evidence[0].text,/Fictional confirmation: DemoVPN/);assert.doesNotMatch(c.evidence[0].text,/Unrelated/);
});
