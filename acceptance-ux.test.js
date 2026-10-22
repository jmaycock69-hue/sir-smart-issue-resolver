import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {compactIntakeFacts,exportGuidance} from './ui-state.js';
import {IntakeStore,ConversationService,intakeSummary} from './conversation.js';
import {CaseStore,createCase,draftComplaint} from './core.js';
import {emailExport} from './correspondence.js';
import {DemoProvider,demoMessages} from './demo-provider.js';
import {previewEvidence} from './evidence.js';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');

test('scripted intake progresses one missing question at a time without a missing-field form checklist',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sir-ux-'));try{
  const store=new IntakeStore(dir),service=new ConversationService(store,new DemoProvider());let s=store.create();
  for(const [i,message]of demoMessages.entries()){
   s=await service.turn(s.id,{revision:s.revision,message,shareConfirmed:true});
   const reply=s.messages.at(-1).text;
   assert.equal((reply.match(/\?/g)||[]).length,i<2?1:0);
   assert.doesNotMatch(reply,/Before creating the case:|Still needed:/);
   assert.equal(intakeSummary(s).ready,i===2);
  }
  assert.equal(s.facts.merchant,'Acorn Outdoor Supplies');assert.equal(s.facts.amount,'89.00');
  assert.equal(s.messages.length,6);assert.equal(compactIntakeFacts(s).length,6);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('compact summary contains supplied facts only and preserves their exact text',()=>{
 const s={caseType:'general',facts:{merchant:'<Untrusted company>',issue:'My stove never arrived',desiredOutcome:'Refund',amount:'89.00',currency:'GBP'}};
 assert.deepEqual(compactIntakeFacts(s).map(x=>x.key),['merchant','issue','desiredOutcome','amount','currency']);
 assert.equal(compactIntakeFacts(s)[0].value,'<Untrusted company>');
 assert.match(html,/row.append\(label,document.createTextNode\(value\)\)/);
 assert.match(html,/el\('fact-review'\)\.hidden=Boolean\(s.caseId\)\|\|!s.summary.ready/);
});

test('full fact editing is optional, starts closed, and Edit details toggles its disclosure',()=>{
 const nodes={'advanced-intake':{open:false},'edit-intake-details':{setAttribute(k,v){this[k]=v;}}};
 const line=html.split('\n').find(l=>l.startsWith("el('edit-intake-details').onclick="));
 vm.runInNewContext(line,{el:id=>nodes[id]});nodes['edit-intake-details'].onclick();
 assert.equal(nodes['advanced-intake'].open,true);assert.equal(nodes['edit-intake-details']['aria-expanded'],'true');
 nodes['edit-intake-details'].onclick();assert.equal(nodes['advanced-intake'].open,false);
 assert.match(html,/<details id="advanced-intake">/);assert.match(html,/el\('advanced-intake'\)\.open=false/);
});

test('first Ask SIR creates a session automatically but live sharing consent is still required',async()=>{
 const handler=html.split('\n').find(l=>l.startsWith("el('send-message').onclick="));
 const nodes={'send-message':{},'ai-consent':{checked:false},'ai-message':{value:demoMessages[0]}};const calls=[];let task,status;
 const context={el:id=>nodes[id],activeIntake:null,reportStatus:t=>status=t,run:f=>{task=f();},showIntake:s=>{context.activeIntake=s;},intakeList:async()=>{},api:async(path,method,input)=>{calls.push({path,method,input});return {id:'intake-one',revision:0};}};
 vm.runInNewContext(handler,context);nodes['send-message'].onclick();assert.equal(calls.length,0);assert.match(status,/Confirm sharing/);
 nodes['ai-consent'].checked=true;nodes['send-message'].onclick();await task;
 assert.deepEqual(calls.map(x=>x.path),['/api/intakes','/api/intakes/intake-one/turn']);
 assert.equal(calls[1].input.shareConfirmed,true);
});

test('approval guidance distinguishes saving, fresh draft review, consent and downloading',()=>{
 const c={draft:'Subject: Complaint\n\nReview me'};
 assert.match(exportGuidance(c,{draftDirty:true}),/Save your complaint draft before approving export/);
 assert.match(exportGuidance({...c,draftNeedsReview:true}),/Generate and review a fresh draft/);
 assert.match(exportGuidance(c),/Enter the recipient and subject/);
 assert.match(exportGuidance(c,{recipient:'test@example.com',subject:'Test'}),/tick the approval confirmation/);
 assert.match(exportGuidance(c,{recipient:'test@example.com',subject:'Test',confirmed:true}),/Select Approve/);
 assert.match(exportGuidance(c,{approved:true}),/Download the unsent/);
});

test('evidence review visibility and confirmation are restored from the pending preview on every control refresh',()=>{
 const body=html.split('// Consumer presentation:')[1].split("for(const id of ['ai-message'")[0];
 const control=body.slice(body.indexOf('controls=function(){'),body.lastIndexOf('\n};')+3);
 const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,validity:{valid:true},setAttribute(){}});return nodes.get(id);};
 const c={id:'case-one',draft:null};const context={controls:null,consumerControls(){},el,current:c,activeIntake:null,scriptedMode:true,busy:false,aiReady:true,dirty:()=>false,detailsDirty:()=>false,exportMatchesDraft:()=>false,exportGuidance,draftUiState:()=>({reason:''}),sourcePreview:{uploadId:'pdf-preview',source:{}}};
 vm.runInNewContext(control,context);context.controls();
 assert.equal(el('source-review').hidden,false);assert.equal(el('source-type').disabled,true);assert.equal(el('source-title').readOnly,true);
 assert.equal(el('save-source').disabled,true);assert.match(el('source-guidance').textContent,/Review this evidence/);
 el('source-confirm').checked=true;context.controls();assert.equal(el('source-review').hidden,false);assert.equal(el('save-source').disabled,false);
 el('source-confirm').checked=false;context.controls();assert.equal(el('save-source').disabled,true);
 context.sourcePreview=null;context.controls();assert.equal(el('source-review').hidden,true);assert.match(el('source-guidance').textContent,/extract your document/);
});

test('obvious business heading, labelled order and payment are suggested without guessing ambiguous fields',()=>{
 const text='Acorn Outdoor Supplies\nOrder reference: ACORN-123\nAmount paid: GBP 89.00\nDate: 2026-10-01';
 const p=previewEvidence({title:'Order',type:'order',text});
 assert.equal(p.candidates.merchant.value,'Acorn Outdoor Supplies');assert.equal(p.candidates.reference.value,'ACORN-123');assert.equal(p.candidates.amount.value,'89.00');assert.equal(p.candidates.currency.value,'GBP');assert.equal(p.source.text,text);
 const q=previewEvidence({title:'Receipt',type:'receipt',text:'Some random prose\nAmount paid: $89.00\nOrder reference: A\nOrder number: B'});
 assert.equal(q.candidates.merchant.value,'');assert.equal(q.candidates.currency.value,'');assert.equal(q.candidates.reference.value,'');assert.equal(q.candidates.reference.ambiguous,true);
 const r=previewEvidence({title:'Receipt',type:'receipt',text:'Acorn Outdoor Supplies\nMerchant: A\nCompany: B\nTotal: GBP 89.00\nAmount paid: GBP 90.00'});
 assert.equal(r.candidates.merchant.value,'');assert.equal(r.candidates.amount.value,'');assert.equal(r.candidates.amount.ambiguous,true);
});

test('a second reviewed evidence record preserves the first original and blocks old approved export across reopening',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sir-two-records-'));try{
  const s=new CaseStore(dir);let c=s.save(createCase({caseType:'general',merchant:'Acorn Outdoor Supplies',issue:'Order did not arrive',desiredOutcome:'Refund',reference:'ACORN-123'}));
  const record=n=>({type:'order',title:'Record '+n,text:'Company: Acorn Outdoor Supplies\nOrder reference: ACORN-123',confirmed:true,facts:{merchant:'Acorn Outdoor Supplies',date:'',amount:'',currency:'',reference:'ACORN-123'}});
  c=s.saveReviewedEvidence(c.id,record(1),c.revision||0);c=s.saveDraft(c.id,draftComplaint(c),c.revision,true);
  c=s.communicationChange(c.id,{recipient:'complaints@acorn.example',subject:'Fictional complaint',kind:'complaint',approved:true},c.revision,'approve');
  const first=c.documents[0],approved=c.communications.at(-1).id;c=s.saveReviewedEvidence(c.id,record(2),c.revision);
  const reopened=new CaseStore(dir).get(c.id);assert.equal(reopened.evidence.length,2);assert.deepEqual(reopened.documents[0],first);assert.equal(reopened.draftNeedsReview,true);
  assert.throws(()=>emailExport(reopened,approved),/review|changed|fresh|current/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
