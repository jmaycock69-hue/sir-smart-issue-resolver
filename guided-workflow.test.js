import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {CaseStore,createCase,draftComplaint} from './core.js';
import {emailExport,caseProgress} from './correspondence.js';
import {guidedAction,communicationReadiness} from './ui-state.js';
import {previewEvidence} from './evidence.js';
const facts={caseType:'general',merchant:'Acorn Outdoor Supplies',issue:'My camping stove was not delivered.',desiredOutcome:'Refund GBP 89.00',amount:'89.00',currency:'GBP',reference:'ACORN-1042',charged:'2026-10-01'};
const approval={recipient:'complaints@acorn.example',subject:'Order ACORN-1042 not delivered',kind:'complaint',approved:true};
const response='Fictional test response: Acorn Outdoor Supplies acknowledges that order ACORN-1042 has not been delivered. The company is investigating and expects to provide an update within seven days.';
function scenario(fn){const dir=mkdtempSync(join(tmpdir(),'sir-guidance-'));try{const s=new CaseStore(dir);let c=s.save(createCase(facts));c=s.saveReviewedEvidence(c.id,{type:'order',title:'Acorn order confirmation',text:'Merchant: Acorn Outdoor Supplies\nOrder reference: ACORN-1042\nOrder date: 2026-10-01\nAmount paid: GBP 89.00',facts:{merchant:facts.merchant,reference:facts.reference,date:'2026-10-01',amount:'89.00',currency:'GBP'},dateRole:'none',confirmed:true},0);c=s.saveDraft(c.id,draftComplaint(c),c.revision,true);c=s.communicationChange(c.id,approval,c.revision,'approve');return fn(s,c,dir);}finally{rmSync(dir,{recursive:true,force:true});}}

test('Acorn response cannot imply sending; export requests stay unsent and survive reopening',()=>scenario((s,c,dir)=>{
 const messageId=c.communications.at(-1).id;const revision=c.revision;
 assert.throws(()=>s.communicationChange(c.id,{messageId,receivedDate:'2026-10-20',text:response},revision,'response'),/actually sent first/);
 assert.equal(s.get(c.id).revision,revision);assert.equal(s.get(c.id).communications.length,1);
 c=s.communicationChange(c.id,{messageId},revision,'export-request');
 const reopened=new CaseStore(dir).get(c.id);assert.ok(reopened.communications[0].exportRequestedAt);assert.equal(reopened.communications[0].sentDate,null);assert.equal(caseProgress(reopened).status,'prepared');
 assert.equal(guidedAction(reopened,{approvedMatches:true}).stage,'sent');assert.match(emailExport(reopened,messageId),/X-Unsent: 1/);
}));

test('Acorn sent, response and closure persist across fresh store instances with exact text',()=>scenario((s,c,dir)=>{
 const messageId=c.communications[0].id;
 c=s.communicationChange(c.id,{messageId,sentDate:'2026-10-20',followUpDate:'2026-10-28',confirmed:true},c.revision,'sent');
 c=s.communicationChange(c.id,{messageId,receivedDate:'2026-10-20',text:response},c.revision,'response');
 let reopened=new CaseStore(dir).get(c.id);assert.equal(reopened.communications.at(-1).body,response);assert.equal(reopened.events.at(-1).type,'response');assert.equal(guidedAction(reopened).stage,'response');
 assert.throws(()=>s.prepareFollowUp(c.id,c.revision,'2026-10-29'),/awaiting/);
 c=s.communicationChange(c.id,{note:'Fictional refund received',confirmed:true},c.revision,'resolve');reopened=new CaseStore(dir).get(c.id);
 assert.equal(guidedAction(reopened).stage,'resolved');assert.throws(()=>emailExport(reopened,messageId),/resolved/);
}));

test('unsolicited communication is explicit, has no invented outgoing message, and persists',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sir-unsolicited-'));try{const s=new CaseStore(dir);let c=s.save(createCase(facts));
 assert.throws(()=>s.communicationChange(c.id,{unsolicited:true,messageId:'invented',receivedDate:'2026-10-20',text:response},0,'response'),/must not claim/);
 assert.throws(()=>s.communicationChange(c.id,{unsolicited:true,receivedDate:'2026-02-30',text:response},0,'response'),/valid response date/);
 c=s.communicationChange(c.id,{unsolicited:true,receivedDate:'2026-10-20',text:response},0,'response');
 const reopened=new CaseStore(dir).get(c.id);assert.equal(reopened.communications.length,1);assert.equal(reopened.communications[0].replyTo,null);assert.equal(reopened.communications[0].unsolicited,true);assert.equal(caseProgress(reopened).status,'response-received');assert.equal(guidedAction(reopened).stage,'response');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('due follow-up guides fresh approval and export; late response blocks recording obsolete follow-up as sent',()=>scenario((s,c)=>{
 const first=c.communications[0].id;
 c=s.communicationChange(c.id,{messageId:first,sentDate:'2026-10-01',followUpDate:'2026-10-10',confirmed:true},c.revision,'sent');
 assert.equal(guidedAction(c,{today:'2026-10-09'}).stage,'waiting');assert.equal(guidedAction(c,{today:'2026-10-10'}).stage,'follow-up');
 c=s.prepareFollowUp(c.id,c.revision,'2026-10-10');assert.equal(guidedAction(c).stage,'email');
 assert.throws(()=>s.prepareFollowUp(c.id,c.revision,'2026-10-10'),/already prepared/);
 c=s.communicationChange(c.id,{...approval,kind:'follow-up'},c.revision,'approve');const id=c.communications.at(-1).id;
 assert.equal(guidedAction(c,{approvedMatches:true}).stage,'export');
 c=s.communicationChange(c.id,{messageId:first,receivedDate:'2026-10-20',text:response},c.revision,'response');
 assert.throws(()=>s.communicationChange(c.id,{messageId:id,sentDate:'2026-10-20',followUpDate:'2026-10-28',confirmed:true},c.revision,'sent'),/response/);
 assert.throws(()=>s.communicationChange(c.id,{messageId:id},c.revision,'export-request'),/response/);
 assert.equal(guidedAction(c).stage,'response');
 assert.match(communicationReadiness(c,{messageId:id,sentConfirmed:true,sentDate:'2026-10-20',followUpDate:'2026-10-28'}).sendReason,/obsolete unanswered follow-up/);
}));

test('unsolicited merchant communication also retires an unanswered follow-up',()=>scenario((s,c)=>{
 c=s.communicationChange(c.id,{messageId:c.communications[0].id,sentDate:'2026-10-01',followUpDate:'2026-10-10',confirmed:true},c.revision,'sent');
 c=s.prepareFollowUp(c.id,c.revision,'2026-10-11');c=s.communicationChange(c.id,{unsolicited:true,receivedDate:'2026-10-20',text:response},c.revision,'response');
 assert.equal(caseProgress(c).status,'response-received');assert.equal(communicationReadiness(c).canFollowUp,false);
 assert.throws(()=>s.communicationChange(c.id,{...approval,kind:'follow-up'},c.revision,'approve'),/response/);
}));

test('draft, recipient and fact edits cannot reuse an obsolete export request or approval',()=>scenario((s,c)=>{
 const old=c.communications[0].id;c=s.saveDraft(c.id,c.draft+'\nMy reviewed additional wording.',c.revision);
 assert.throws(()=>s.communicationChange(c.id,{messageId:old},c.revision,'export-request'),/no longer current/);
 assert.equal(guidedAction(c,{draftDirty:true}).stage,'draft-edits');
 assert.equal(guidedAction(c,{recipient:'new@acorn.example',subject:approval.subject,approvedMatches:false}).stage,'approve-review');
 c=s.updateDetails(c.id,{...c,desiredOutcome:'A replacement stove'},c.revision);assert.equal(guidedAction(c).stage,'stale');
}));

test('state guidance covers intake confirmation, pending evidence, conflicts and account-only choice',()=>{
 assert.equal(guidedAction(null,{aiReady:true}).target,'ai-message');
 const intake={summary:{ready:true}};assert.equal(guidedAction(null,{intake}).target,'intake-confirm');assert.equal(guidedAction(null,{intake,intakeConfirmed:true}).target,'commit-intake');
 assert.equal(guidedAction(null,{proposedDirty:true}).stage,'corrections');
 const c={...facts,evidence:[],draft:null};assert.equal(guidedAction(c).stage,'evidence');assert.equal(guidedAction(c,{accountOnly:true}).stage,'draft');
 assert.equal(guidedAction(c,{preview:{},sourceConfirmed:false}).target,'source-confirm');assert.equal(guidedAction(c,{preview:{},sourceConfirmed:true}).target,'save-source');
 const withRecord={...c,evidence:[{type:'receipt'}]};assert.equal(guidedAction(withRecord,{checks:{ready:false,issues:['Amount conflict']}}).stage,'conflict');
 assert.equal(guidedAction(withRecord,{caseDirty:true}).target,'save-details');
});

test('response readiness explains exact prerequisite before save and retains sent/date gates',()=>scenario((s,c)=>{
 const messageId=c.communications[0].id;let form={messageId,receivedDate:'2026-10-20',responseText:response};
 let f=communicationReadiness(c,form);assert.equal(f.canRespond,false);assert.match(f.responseReason,/actually sent first/);
 assert.equal(communicationReadiness(c,{...form,unsolicited:true}).canRespond,true);
 c=s.communicationChange(c.id,{messageId,sentDate:'2026-10-20',followUpDate:'2026-10-28',confirmed:true},c.revision,'sent');
 assert.equal(communicationReadiness(c,form).canRespond,true);assert.match(communicationReadiness(c,{...form,receivedDate:'2026-10-19'}).responseReason,/cannot precede/);
 assert.match(communicationReadiness(c,{...form,dirty:true}).responseReason,/save any/);
}));

test('semantic date extraction keeps order, payment and delivery dates distinct',()=>{
 const p=previewEvidence({type:'order',title:'Order',text:'Order confirmation\nAcorn Outdoor Supplies\nOrder reference: ACORN-1042\nOrder date: 2026-10-01\nPayment date: 2026-10-02\nDelivery date: 2026-10-08'});
 assert.equal(p.candidates.merchant.value,facts.merchant);assert.equal(p.candidates.date.value,'');assert.equal(p.candidates.date.ambiguous,true);assert.equal(p.candidates.date.role,'none');assert.equal(p.candidates.date.fields.length,3);
 const order=previewEvidence({type:'order',title:'Order',text:'Order date: 2026-10-01'});assert.equal(order.candidates.date.role,'none');
 const payment=previewEvidence({type:'receipt',title:'Payment',text:'Payment date: 2026-10-01'});assert.equal(payment.candidates.date.role,'charged');
 const same=previewEvidence({type:'order',title:'Dates',text:'Order date: 2026-10-01\nPayment date: 2026-10-01'});assert.equal(same.candidates.date.value,'');assert.equal(same.candidates.date.role,'none');
});

test('merchant extraction supports explicit sellers and does not override conflicting labels',()=>{
 const p=previewEvidence({type:'order',title:'Order',text:'Seller: Acorn Outdoor Supplies\nOrder reference: ACORN-1042'});assert.equal(p.candidates.merchant.value,facts.merchant);assert.match(p.candidates.merchant.quotes[0],/Seller/);
 const conflict=previewEvidence({type:'order',title:'Order',text:'Company name: A Store\nSeller: B Store'});assert.equal(conflict.candidates.merchant.value,'');assert.equal(conflict.candidates.merchant.ambiguous,true);
 const headings=previewEvidence({type:'order',title:'Order',text:'A Store\nB Store\nOrder reference: A'});assert.equal(headings.candidates.merchant.value,'');
});

test('correspondence references reviewed records concisely while the full original remains saved',()=>scenario((s,c)=>{
 assert.match(c.draft,/Outcome I am requesting:\nRefund GBP 89.00/);assert.match(c.draft,/Acorn order confirmation/);assert.match(c.draft,/original retained in the case/);
 assert.doesNotMatch(c.draft,/Merchant: Acorn Outdoor Supplies\nOrder reference:/);assert.match(c.documents[0].text,/Merchant: Acorn Outdoor Supplies/);
}));

test('guidance supports faulty-product and billing cases with the same evidence safeguards',()=>{
 for(const [complaintType,issue] of [['faulty-product','The kettle leaks.'],['billing','The provider billed me twice.']]){
  const c=createCase({...facts,complaintType,issue});assert.equal(guidedAction(c).stage,'evidence');assert.equal(guidedAction(c,{accountOnly:true}).stage,'draft');
  assert.match(draftComplaint({...c,accountOnlyConfirmed:true}),new RegExp(issue.replace('.','\\.')));
 }
});

test('production browser script parses; navigation, keyboard and motion safeguards are present',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'');new vm.Script(script);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);assert.match(html,/\.guided-pulse\{animation:none/);assert.match(html,/target.focus\(\{preventScroll:true\}\)/);assert.match(html,/target.scrollIntoView/);assert.match(html,/\.app\{max-width:none/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
});

test('guided response entry reaches save and confirmed resolution without assuming an outcome',()=>scenario((s,c)=>{
 const messageId=c.communications[0].id;
 assert.equal(guidedAction(c,{form:{messageId,responseText:response}}).stage,'response-prerequisite');
 c=s.communicationChange(c.id,{messageId,sentDate:'2026-10-20',followUpDate:'2026-10-28',confirmed:true},c.revision,'sent');
 assert.equal(guidedAction(c,{form:{messageId,responseText:response,receivedDate:'2026-10-20'}}).target,'record-response');
 c=s.communicationChange(c.id,{messageId,receivedDate:'2026-10-20',text:response},c.revision,'response');
 assert.equal(guidedAction(c).target,'resolution-note');
 assert.equal(guidedAction(c,{form:{resolutionNote:'Fictional refund received'}}).target,'resolution-confirm');
 assert.equal(guidedAction(c,{form:{resolutionNote:'Fictional refund received',resolutionConfirmed:true}}).target,'resolve-case');
}));

test('recording sending preserves a typed response, while response success clears it and case switches discard it',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');const start=html.indexOf('const lifecycleShow=show;'),end=html.indexOf('const lifecycleChecks=',start);const script=html.slice(start,end);
 const nodes=new Map(['response-text','response-date','unsolicited-response','resolution-note'].map(k=>[k,{value:'',checked:false}]));const el=id=>nodes.get(id);const first={id:'first',communications:[]};
 const context={current:first,el,controls(){},show(c){context.current=c;for(const n of nodes.values())n.value='';}};
 vm.runInNewContext(script,context);el('response-text').value=response;el('response-date').value='2026-10-20';
 context.show({...first,communications:[{kind:'complaint',sentDate:'2026-10-20'}]});assert.equal(el('response-text').value,response);assert.equal(el('response-date').value,'2026-10-20');
 context.show({...first,communications:[{kind:'response',body:response}]});assert.equal(el('response-text').value,'');
 el('response-text').value='Unsubmitted text';context.show({id:'second',communications:[]});assert.equal(el('response-text').value,'');
});
