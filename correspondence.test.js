import test from'node:test';
import assert from'node:assert/strict';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{CaseStore,fictionalCase,draftComplaint}from'./core.js';
import{emailExport,caseProgress}from'./correspondence.js';
const approve=()=>({recipient:'complaints@merchant.company',subject:'Please review this fictional charge',kind:'complaint',approved:true});
function setup(fn){const dir=mkdtempSync(join(tmpdir(),'sir-mail-'));try{const store=new CaseStore(dir);const c=store.save(fictionalCase());store.saveDraft(c.id,draftComplaint(c),0,true);fn(store,store.get(c.id),dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('approved export is a draft email, remains unsent and persists the full reviewed message',()=>setup((s,c,dir)=>{
 const saved=s.communicationChange(c.id,approve(),1,'approve');const message=saved.communications[0];assert.equal(message.sentDate,null);assert.equal(caseProgress(saved).status,'prepared');const eml=emailExport(saved,message.id);assert.match(eml,/X-Unsent: 1/);assert.match(eml,/To: complaints@merchant.company/);const body=Buffer.from(eml.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString();assert.match(body,/\[E1\]/);assert.equal(new CaseStore(dir).get(c.id).communications[0].body,message.body);assert.equal(saved.events.at(-1).type,'approve');
}));
test('approval requires explicit review, current evidence, safe recipient/subject and a matching revision',()=>setup((s,c)=>{
 for(const input of [{...approve(),approved:false},{...approve(),recipient:'valid@merchant.company\r\nBcc: attacker@other.company'},{...approve(),subject:'Hello\nBcc: other'},{...approve(),kind:'send'}])assert.throws(()=>s.communicationChange(c.id,input,1,'approve'));assert.throws(()=>s.communicationChange(c.id,approve(),0,'approve'),/changed/);assert.equal(s.get(c.id).communications,undefined);
 const input={merchant:c.merchant,amount:c.amount,currency:c.currency,cancelled:c.cancelled,charged:c.charged,evidence:[]};s.updateDetails(c.id,input,1);assert.throws(()=>s.communicationChange(c.id,approve(),2,'approve'),/evidence/);
}));
test('edited or evidence-stale draft cannot reuse an earlier export approval',()=>setup((s,c)=>{
 const approved=s.communicationChange(c.id,approve(),1,'approve');const edited=s.saveDraft(c.id,c.draft+'\nNew human wording.',2);assert.throws(()=>emailExport(edited,approved.communications[0].id),/no longer current/);const again=s.communicationChange(c.id,approve(),3,'approve');const changed=s.updateDetails(c.id,{...again,amount:'20.00',evidence:again.evidence.map(e=>({...e,merchant:e.merchant||'StreamNest'}))},4);assert.throws(()=>emailExport(changed,again.communications.at(-1).id),/no longer current/);
}));
test('only manual send confirmation creates an awaiting-response status and follow-up date',()=>setup((s,c)=>{
 const prepared=s.communicationChange(c.id,approve(),1,'approve');const id=prepared.communications[0].id;const input={messageId:id,sentDate:'2026-10-01',followUpDate:'2026-10-15',confirmed:false};assert.throws(()=>s.communicationChange(c.id,input,2,'sent'),/actually sent/);assert.throws(()=>s.communicationChange(c.id,{...input,confirmed:true,followUpDate:'2026-09-30'},2,'sent'),/dates/);const sent=s.communicationChange(c.id,{...input,confirmed:true},2,'sent');assert.equal(caseProgress(sent,'2026-10-10').status,'awaiting-response');assert.match(caseProgress(sent,'2026-10-10').nextAction,/2026-10-15/);assert.match(caseProgress(sent,'2026-10-16').nextAction,/outstanding/);assert.throws(()=>s.communicationChange(c.id,{...input,confirmed:true},3,'sent'),/already/);
}));
test('due follow-up retains the original complaint in draft history and needs separate approval',()=>setup((s,c)=>{
 const prepared=s.communicationChange(c.id,approve(),1,'approve');const sent=s.communicationChange(c.id,{messageId:prepared.communications[0].id,sentDate:'2026-09-01',followUpDate:'2026-09-15',confirmed:true},2,'sent');assert.throws(()=>s.prepareFollowUp(c.id,3,'2026-09-10'),/review date/);const followed=s.prepareFollowUp(c.id,3,'2026-09-16');assert.match(followed.draft,/Follow-up/);assert.match(followed.draft,/2026-09-01/);assert.ok(followed.draftHistory.some(h=>h.text===c.draft));assert.throws(()=>emailExport(followed,sent.communications[0].id),/no longer current/);assert.equal(followed.communications.length,1);
}));
test('response stops outstanding follow-up and resolution persists with a chronological history',()=>setup((s,c,dir)=>{
 const approved=s.communicationChange(c.id,approve(),1,'approve');const id=approved.communications[0].id;s.communicationChange(c.id,{messageId:id,sentDate:'2026-10-01',followUpDate:'2026-10-15',confirmed:true},2,'sent');const response=s.communicationChange(c.id,{messageId:id,receivedDate:'2026-10-10',text:'Fictional response: we have refunded the charge.'},3,'response');assert.equal(caseProgress(response).status,'response-received');assert.throws(()=>s.prepareFollowUp(c.id,4,'2026-10-16'),/awaiting/);assert.throws(()=>s.communicationChange(c.id,{confirmed:false,note:'Refund received'},4,'resolve'),/confirm/);s.communicationChange(c.id,{confirmed:true,note:'Fictional refund received'},4,'resolve');const reopened=new CaseStore(dir).get(c.id);assert.equal(caseProgress(reopened).status,'resolved');assert.deepEqual(reopened.events.slice(-3).map(e=>e.type),['sent','response','resolve']);assert.equal(reopened.communications.at(-1).body,response.communications.at(-1).body);
}));
test('correspondence remains isolated between independently saved cases',()=>setup((s,c)=>{
 const other=s.save(fictionalCase());s.communicationChange(c.id,approve(),1,'approve');assert.equal(s.get(other.id).communications,undefined);assert.throws(()=>emailExport(s.get(other.id),s.get(c.id).communications[0].id),/approved/);
}));

test('follow-up type survives reopening and editing; a response blocks its approval and export',()=>setup((s,c,dir)=>{
 const approved=s.communicationChange(c.id,approve(),1,'approve');const id=approved.communications[0].id;
 s.communicationChange(c.id,{messageId:id,sentDate:'2026-09-01',followUpDate:'2026-09-15',confirmed:true},2,'sent');
 const follow=s.prepareFollowUp(c.id,3,'2026-09-16');assert.equal(new CaseStore(dir).get(c.id).draftKind,'follow-up');
 const edited=s.saveDraft(c.id,follow.draft+'\nReviewed.',4);assert.equal(edited.draftKind,'follow-up');
 assert.throws(()=>s.communicationChange(c.id,approve(),5,'approve'),/message type/);
 const ready=s.communicationChange(c.id,{...approve(),kind:'follow-up'},5,'approve');const followId=ready.communications.at(-1).id;
 const answered=s.communicationChange(c.id,{messageId:id,receivedDate:'2026-09-17',text:'Fictional refund agreed.'},6,'response');
 assert.equal(answered.draft,edited.draft);assert.throws(()=>emailExport(answered,followId),/response/);
 assert.throws(()=>s.communicationChange(c.id,{...approve(),kind:'follow-up'},7,'approve'),/response/);
}));
test('resolution retains the saved draft but blocks further export and approval',()=>setup((s,c)=>{
 const approved=s.communicationChange(c.id,approve(),1,'approve');
 const resolved=s.communicationChange(c.id,{confirmed:true,note:'Fictional refund received'},2,'resolve');
 assert.equal(resolved.draft,c.draft);assert.throws(()=>emailExport(resolved,approved.communications[0].id),/resolved/);
 assert.throws(()=>s.communicationChange(c.id,approve(),3,'approve'),/resolved/);
}));
