import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CaseStore,createCase,checkEvidence,draftComplaint,fictionalCase} from './core.js';
import {IntakeStore,ConversationService,intakeSummary} from './conversation.js';
import {generalSummary} from './complaint-model.js';
import {emailExport} from './correspondence.js';
import {DocumentIntake} from './documents.js';
import {inspectPolicy} from './research.js';

const nord={caseType:'general',merchant:'Nord VPN',issue:'The VPN download failed and showed errors, but the annual charge was taken. I did not receive the service.',desiredOutcome:'Please refund the USD 99.95 charge or explain how you will supply the service.',complaintType:'non-delivery',amount:'99.95',currency:'USD',charged:'2026-10-16',cancelled:'2026-10-16'};
function temporary(fn){const dir=mkdtempSync(join(tmpdir(),'sir-general-'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
async function temporaryAsync(fn){const dir=mkdtempSync(join(tmpdir(),'sir-general-'));try{return await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
const reviewed=(type,text,facts={},extra={})=>({type,title:'Fictional '+type,text,confirmed:true,facts:{merchant:'',date:'',amount:'',currency:'',...facts},...extra});

test('different consumer complaints share one workflow without mandatory cancellation or amount',()=>{
 for(const [category,issue,outcome]of [
  ['non-delivery','My order never arrived.','Deliver the order or refund me.'],
  ['faulty-product','The new kettle does not switch on.','Replace it with a working kettle.'],
  ['billing','I was billed twice.','Investigate and reverse the duplicate charge.'],
  ['poor-service','The adviser repeatedly failed to return agreed calls.','Explain what happened and apologise.'],
  ['booking','The room I reserved was unavailable on arrival.','Explain and offer an appropriate remedy.'],
  ['other','An incorrect account restriction prevents access.','Review the restriction and restore access if it was an error.']]){
   const c=createCase({caseType:'general',merchant:'Fictional Company',issue,desiredOutcome:outcome,complaintType:category});
   assert.equal(c.evidence.length,0);assert.equal(c.cancelled,'');assert.equal(c.amount,'');
   assert.equal(generalSummary({facts:c}).ready,true);
   assert.throws(()=>draftComplaint(c),/explicitly choose/);
   const text=draftComplaint({...c,accountOnlyConfirmed:true});
   assert.ok(text.includes(issue));assert.ok(text.includes(outcome));
   assert.match(text,/account only/);assert.doesNotMatch(text,/subsequent|subscription charge/);
 }
});

test('NordVPN same-day dates remain unchanged and neutral drafting never invents event order',()=>{
 const c=createCase(nord);assert.equal(generalSummary({facts:c}).ready,true);
 const text=draftComplaint({...c,accountOnlyConfirmed:true});
 assert.equal(c.charged,c.cancelled);assert.match(text,/not asserting their order/);
 assert.ok(text.includes('99.95'));assert.doesNotMatch(text,/subsequent/);
 assert.equal(checkEvidence(c).ready,false);
});

test('unknown fields stay unknown, zero amounts are allowed and missing currency is not invented',()=>{
 const c=createCase({...nord,charged:'',cancelled:'',currency:''});
 const text=draftComplaint({...c,accountOnlyConfirmed:true});
 assert.match(text,/currency not supplied/);assert.doesNotMatch(text,/Payment or charge date:/);
 assert.equal(createCase({...nord,amount:'0.00'}).amount,'0.00');
 assert.throws(()=>createCase({...nord,incidentDate:'2026-02-30'}),/valid/);
 assert.throws(()=>createCase({...nord,desiredOutcome:''}),/Outcome/);
});

test('new AI intake asks only general required facts and commits without documentary evidence',()=>temporaryAsync(async dir=>{
 const store=new IntakeStore(join(dir,'intakes')),cases=new CaseStore(join(dir,'cases'));
 const session=store.create();assert.equal(session.schemaVersion,2);assert.equal(intakeSummary(session).missing.length,3);
 const message='Fictional shop: the kettle is broken. Please replace it.';
 let workflow;
 const service=new ConversationService(store,{respond:async context=>{workflow=context.workflow;return {reply:'I have the facts.',updates:[{field:'merchant',value:'Fictional shop',quote:'Fictional shop'},{field:'issue',value:'The kettle is broken.',quote:'the kettle is broken'},{field:'desiredOutcome',value:'Please replace it.',quote:'Please replace it.'}]};}});
 const saved=await service.turn(session.id,{revision:0,shareConfirmed:true,message});
 assert.equal(workflow.missing.length,3);assert.equal(intakeSummary(saved).ready,true);assert.match(saved.messages.at(-1).text,/review the summary below/);
 const c=store.commit(session.id,{revision:saved.revision,confirmed:true},cases);
 assert.equal(c.caseType,'general');assert.equal(c.evidence.length,0);assert.equal(c.amount,'');
 assert.equal(new IntakeStore(join(dir,'intakes')).get(session.id).caseId,c.id);
}));

test('legacy uncommitted NordVPN conversation is preserved and can be corrected then committed',()=>temporary(dir=>{
 const store=new IntakeStore(join(dir,'intakes')),cases=new CaseStore(join(dir,'cases'));
 const old=store.create({version:1});delete old.schemaVersion;
 old.facts={merchant:'Nord VPN',amount:'99.95',currency:'USD',charged:'2026-10-16',cancelled:'2026-10-16'};
 old.messages=[{role:'user',text:nord.issue},{role:'assistant',text:'Earlier prototype reply.'}];store.save(old);
 const before=readFileSync(store.path(old.id),'utf8'),upgraded=store.get(old.id);
 assert.equal(upgraded.schemaVersion,2);assert.equal(upgraded.facts.issue,nord.issue);
 assert.deepEqual(intakeSummary(upgraded).missing,['Outcome requested']);
 assert.equal(readFileSync(store.path(old.id),'utf8'),before);
 const reviewed=store.reviewFacts(old.id,{revision:0,confirmed:true,facts:{desiredOutcome:nord.desiredOutcome}});
 const c=store.commit(old.id,{revision:reviewed.revision,confirmed:true},cases);
 assert.equal(c.charged,c.cancelled);assert.deepEqual(c.conversation,old.messages);
 assert.equal(c.claimProvenance.at(-1).origin,'human-review');
}));

test('unquoted AI facts and stale or unsupported manual corrections cannot mutate general intake',()=>temporary(dir=>{
 const s=new IntakeStore(dir),session=s.create();
 assert.throws(()=>s.saveTurn(session.id,0,'Hello',{reply:'Done',updates:[{field:'issue',value:'Invented',quote:'not present'}]}),/quotation/);
 assert.throws(()=>s.reviewFacts(session.id,{revision:0,confirmed:true,facts:{sendEmail:'now'}}),/Unsupported/);
 assert.throws(()=>s.reviewFacts(session.id,{revision:9,confirmed:true,facts:{merchant:'Shop'}}),/changed/);
 assert.deepEqual(s.get(session.id),session);
}));

test('general records retain originals, contradictions block even account-only drafting, exclusion is audited',()=>temporary(dir=>{
 const s=new CaseStore(dir);let c=s.save(createCase(nord));
 c=s.saveReviewedEvidence(c.id,reviewed('receipt','Merchant: Nord VPN\nCharge date: 2026-10-16\nAmount: USD 9.95',{merchant:'Nord VPN',date:'2026-10-16',amount:'9.95',currency:'USD'},{dateRole:'charged'}),0);
 assert.equal(c.evidence[0].id,'G1');assert.equal(checkEvidence({...c,accountOnlyConfirmed:true}).ready,false);
 assert.throws(()=>draftComplaint({...c,accountOnlyConfirmed:true}),/Amount conflict/);
 assert.throws(()=>s.setEvidenceStatus(c.id,{revision:c.revision,evidenceId:'G1',active:false,confirmed:false,reason:'Wrong transaction'}),/Confirm/);
 c=s.setEvidenceStatus(c.id,{revision:c.revision,evidenceId:'G1',active:false,confirmed:true,reason:'Fictional receipt deliberately mismatched; replaced by correct receipt.'});
 c=s.saveReviewedEvidence(c.id,reviewed('receipt','Merchant: Nord VPN\nCharge date: 2026-10-16\nAmount: USD 99.95',{merchant:'Nord VPN',date:'2026-10-16',amount:'99.95',currency:'USD'},{dateRole:'charged'}),c.revision);
 assert.equal(checkEvidence(c).ready,true);assert.equal(c.documents.length,2);assert.equal(c.evidence[0].active,false);
 assert.match(draftComplaint(c),/\[G2\]/);assert.doesNotMatch(draftComplaint(c),/\[G1\]/);
 assert.ok(c.events.some(e=>e.type==='evidence-status'));
}));

test('a consumer statement is usable but explicitly distinguished from corroboration',()=>temporary(dir=>{
 const s=new CaseStore(dir);let c=s.save(createCase({...nord,amount:'',currency:''}));
 c=s.saveReviewedEvidence(c.id,reviewed('statement','My own account: the service failed.'),0);
 assert.equal(checkEvidence(c).ready,true);assert.match(checkEvidence(c).warnings.join(' '),/not independent/);
 assert.match(draftComplaint(c),/Consumer statement — not independent evidence/);
}));

test('general case edits retain records, reset account-only consent, stale the draft and invalidate approval',()=>temporary(dir=>{
 const s=new CaseStore(dir);let c=s.save(createCase(nord));
 c=s.saveDraft(c.id,draftComplaint({...c,accountOnlyConfirmed:true}),0,true,'complaint',true);
 c=s.communicationChange(c.id,{approved:true,recipient:'fictional@example.org',subject:'Complaint',kind:'complaint'},c.revision,'approve');
 const approvedId=c.communications[0].id;
 c=s.updateDetails(c.id,{...c,desiredOutcome:'Please investigate and explain the charge.'},c.revision);
 assert.equal(c.accountOnlyConfirmed,false);assert.equal(c.draftNeedsReview,true);assert.throws(()=>emailExport(c,approvedId),/no longer current/);
 assert.ok(c.caseHistory.at(-1).desiredOutcome.includes('refund'));
}));

test('general complaint approval, unsent export, follow-up and resolution survive reopening',()=>temporary(dir=>{
 const s=new CaseStore(dir);let c=s.save(createCase(nord));
 c=s.saveDraft(c.id,draftComplaint({...c,accountOnlyConfirmed:true}),0,true,'complaint',true);
 assert.throws(()=>s.communicationChange(c.id,{approved:false},c.revision,'approve'),/explicitly approve/);
 c=s.communicationChange(c.id,{approved:true,recipient:'fictional@example.org',subject:'Complaint about failed service',kind:'complaint'},c.revision,'approve');
 assert.match(emailExport(c,c.communications[0].id),/X-Unsent: 1/);
 c=s.communicationChange(c.id,{messageId:c.communications[0].id,sentDate:'2026-10-16',followUpDate:'2026-10-17',confirmed:true},c.revision,'sent');
 c=s.prepareFollowUp(c.id,c.revision,'2026-10-17');assert.match(c.draft,/Follow-up on complaint/);assert.doesNotMatch(c.draft,/subscription charge dated/);
 const messageId=c.communications[0].id;
 c=s.communicationChange(c.id,{messageId,receivedDate:'2026-10-17',text:'Fictional response: investigating.'},c.revision,'response');
 assert.throws(()=>s.communicationChange(c.id,{approved:true},c.revision,'approve'),/history/);
 c=s.communicationChange(c.id,{confirmed:true,note:'Fictional rehearsal concluded.'},c.revision,'resolve');
 const reopened=new CaseStore(dir).get(c.id);assert.equal(reopened.caseType,'general');assert.ok(reopened.resolution);
 assert.throws(()=>s.saveDraft(c.id,'New words',c.revision),/historical/);
}));

test('general document intake supports plain-text correspondence without required monetary fields',()=>temporaryAsync(async dir=>{
 const s=new CaseStore(dir);let c=s.save(createCase({...nord,amount:'',currency:''}));const docs=new DocumentIntake();
 const text='Fictional correspondence: we are still investigating your failed activation.';
 const preview=await docs.preview(c.id,0,{name:'correspondence.txt',type:'correspondence',base64:Buffer.from(text).toString('base64')});
 const attached=docs.attach(c.id,0,{...preview.source,uploadId:preview.uploadId,confirmed:true,facts:{merchant:'',date:'',amount:'',currency:''}});
 c=s.saveReviewedEvidence(c.id,attached,0,attached.documentFile);
 assert.equal(c.documents[0].file.bytes,Buffer.byteLength(text));assert.equal(checkEvidence(c).ready,true);
}));

test('legacy cancellation validation and evidence requirements remain unchanged',()=>{
 const c=fictionalCase();assert.equal(checkEvidence(c).ready,true);assert.match(draftComplaint(c),/subsequent/);
 assert.equal(checkEvidence({...c,charged:c.cancelled}).ready,false);
 assert.equal(checkEvidence({...c,evidence:[]}).ready,false);
});

test('official policy review recognises delivery, warranty and booking terms',()=>{
 const result=inspectPolicy('<html><title>Service terms</title><p>Delivery delays are reviewed by our team.</p><p>Warranty repairs require a product inspection.</p><p>Booking changes depend on room availability.</p><a href="/delivery">Delivery terms</a></html>','https://example.org/policy');
 for(const term of ['Delivery delays','Warranty repairs','Booking changes'])assert.ok(result.passages.some(p=>p.text.includes(term)));
 assert.ok(result.links.some(link=>link.url.endsWith('/delivery')));
});
