import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stageGuidance,guidedAction,emailPreview,recipientDescription,visibleStatus} from './ui-state.js';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const c={id:'test',draft:'Subject: Complaint\n\nMy reviewed complaint.',evidence:[],communications:[]};
const next={...guidedAction(c),pane:'email'};

test('saved draft resumes at Email while Outcome explains actual sending and unsolicited replies',()=>{
 assert.equal(next.stage,'email');assert.match(next.copy,/Email is the next step/);
 const guidance=stageGuidance(c,'activity',next);
 assert.match(guidance.copy,/No outgoing complaint is recorded as sent/);
 assert.match(guidance.copy,/unsolicited communication/);assert.match(guidance.copy,/Next step: Email/);
 assert.doesNotMatch(guidance.copy,/edit|wording below|Save draft/);
});

test('guidance follows the current stage and keeps the saved resume target unchanged',()=>{
 for(const pane of ['assistant','evidence','drafts','email','activity','cases','history']){
  const guidance=stageGuidance(c,pane,next);assert.ok(guidance.title);assert.ok(guidance.copy);
 }
 assert.match(stageGuidance(c,'evidence',next).copy,/extracted facts/);
 assert.match(stageGuidance(c,'drafts',next).copy,/save any edits/);
 assert.equal(stageGuidance(c,'cases',next),next);assert.equal(next.pane,'email');
 assert.match(stageGuidance(null,'activity',next).copy,/Create a case in Tell SIR or open one/);
 const closed={...next,stage:'resolved',title:'Your case is closed',copy:'Retained history.'};
 assert.equal(stageGuidance({...c,resolution:{note:'Refund received'}},'activity',closed),closed);
});

test('Outcome retains response, send and resolution prerequisites without granting permissions',()=>{
 const sent={...c,communications:[{id:'out',approvedAt:'2026-10-20',draftText:c.draft,sentDate:'2026-10-20',followUpDate:'2026-10-28'}]};
 const waiting=guidedAction(sent,{today:'2026-10-22'});waiting.pane='activity';
 assert.match(stageGuidance(sent,'activity',waiting).copy,/Await the merchant/);
 const form={messageId:'out',responseText:'Merchant reply',receivedDate:'2026-10-22'};
 const response=guidedAction(sent,{form});response.pane='activity';
 assert.equal(stageGuidance(sent,'activity',response).target,'record-response');
 const prerequisite=guidedAction(c,{form:{responseText:'Independent contact'}});prerequisite.pane='activity';
 assert.match(stageGuidance(c,'activity',prerequisite).copy,/unsolicited/);
});

test('email preview uses entered recipient only, never a placeholder or previous recipient',()=>{
 const blank=emailPreview('','Complaint',c.draft);assert.match(blank,/To: \[recipient not entered\]/);assert.doesNotMatch(blank,/acorn\.example/);
 const first=emailPreview('complaints@acorn.example','Review',c.draft);assert.match(first,/^To: complaints@acorn.example\nSubject: Review\n\nMy reviewed complaint\./);
 const changed=emailPreview('new@merchant.test','Changed',c.draft);assert.match(changed,/^To: new@merchant.test/);assert.doesNotMatch(changed,/acorn\.example/);
 assert.match(recipientDescription(''),/placeholder/);assert.match(recipientDescription('complaints@acorn.example'),/Entered example/);
 assert.match(recipientDescription('test@example.com'),/testing only/);assert.match(recipientDescription('complaints@merchant.test'),/published complaint address/);
});

test('editing the actual email fields updates preview and clears prior explicit approval',()=>{
 const nodes={'email-approve-confirm':{checked:true},'email-preview':{},'email-recipient':{value:'new@merchant.test'},'email-subject':{value:'Current subject'},output:{value:c.draft},'recipient-guidance':{}};
 const script=html.split('\n').find(line=>line.startsWith('function refreshEmailPreview()'));
 const context={el:id=>nodes[id],emailPreview,recipientDescription};vm.runInNewContext(script,context);context.refreshEmailPreview();
 assert.equal(nodes['email-approve-confirm'].checked,false);assert.match(nodes['email-preview'].value,/To: new@merchant.test/);
 nodes['email-recipient'].value='';context.refreshEmailPreview();assert.match(nodes['email-preview'].value,/recipient not entered/);
 assert.match(html,/id="email-recipient" type="email" required/);
 assert.match(html,/!el\('email-recipient'\)\.validity.valid/);
});

test('sidebar is the only stage list and all seven navigation destinations remain wired',()=>{
 assert.doesNotMatch(html,/const progress=make|before\(progress\)|progress.children/);
 for(const pane of ['assistant','evidence','drafts','email','activity','cases','history'])assert.match(html,new RegExp("\\['"+pane+"','"));
 const script=html.slice(html.indexOf('function navigate(name,'),html.indexOf("for(const button of document.querySelectorAll('[data-nav]'))button.onclick"));
 const panes=['assistant','evidence','drafts','email','activity','cases','history'].map(name=>({dataset:{pane:name},hidden:true}));
 const buttons=panes.map(p=>({dataset:{nav:p.dataset.pane},setAttribute(k,v){this[k]=v;}}));
 const context={paneNames:Object.fromEntries(panes.map(p=>[p.dataset.pane,p.dataset.pane])),paneScroll:{},activePane:'assistant',window:{scrollY:0},document:{querySelectorAll:s=>s==='[data-pane]'?panes:buttons},refreshGuide(){}};
 vm.runInNewContext(script,context);
 for(const pane of panes){context.navigate(pane.dataset.pane,false);assert.equal(panes.filter(p=>!p.hidden).length,1);assert.equal(pane.hidden,false);assert.equal(buttons.find(b=>b.dataset.nav===pane.dataset.pane)['aria-current'],'page');}
});

test('startup clears Working after successful read-only initialization',async()=>{
 const node={textContent:''};const script=html.split('\n').find(line=>line.startsWith('function reportStatus(text)'));
 const context={busy:false,current:null,el:()=>node,controls(){}};vm.runInNewContext(script,context);
 let finish;const pending=context.run(()=>new Promise(resolve=>finish=resolve));assert.equal(node.textContent,'Working.');finish();await pending;
 assert.equal(node.textContent,'');assert.equal(context.busy,false);
});

test('redundant restore guidance is suppressed while errors, confirmations and warnings remain',()=>{
 for(const text of ['Done. Review the draft.','Your saved case and draft are restored. You can edit the draft.','Your case is restored. Check evidence.','The fictional records agree. You can prepare a complaint.'])assert.equal(visibleStatus(text),'');
 for(const text of ['Invalid recipient.','Email approved for local export. Nothing has been sent.','Merchant response saved locally against this case.','Save your draft edits before continuing.','The AI conversation is not connected.'])assert.equal(visibleStatus(text),text);
 assert.doesNotMatch(html,/Drafts & Activity|Working…/);
 assert.match(html,/el\('case-progress'\)\.hidden=true/);
});

test('primary continuation has its own centered row; approval and preview remain accessible',()=>{
 assert.match(html,/continueRow.append\(continueEmail\);draftPanel.append\(continueRow\)/);
 assert.match(html,/\.primary-action-row\{display:flex;justify-content:center/);
 assert.match(html,/secondaryRow.append\(el\('regenerate'\)\)/);
 assert.match(html,/#email-preview\{min-height:620px\}/);
 assert.match(html,/\['source-confirm','email-approve-confirm'\]/);
 assert.match(html,/continueEmail.disabled=busy\|\|dirty\(\)\|\|detailsDirty\(\)/);
});
