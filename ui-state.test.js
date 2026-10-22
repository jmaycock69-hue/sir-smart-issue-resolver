import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CaseStore,fictionalCase,checkEvidence} from './core.js';
import {caseFormValues,correspondenceDates,restoreDates,displayDate,exportMatchesDraft,intakeReadiness} from './ui-state.js';

test('reopening missing evidence leaves dates and amounts visibly unknown',()=>{
  const c={...fictionalCase(),evidence:[]};
  const fields=caseFormValues(c);
  assert.equal(fields.cancelled,'2026-09-28');
  assert.equal(fields['e1-date'],'');
  assert.equal(fields['e2-date'],'');
  assert.equal(fields['e2-amount'],'');
  assert.equal(fields.e1,false);
  assert.equal(fields.e2,false);
  assert.equal(caseFormValues({...c,cancelled:null}).cancelled,'');
});

test('date edit persists across stores, leaves independent evidence intact and marks draft stale',()=>{
  const directory=mkdtempSync(join(tmpdir(),'sir-date-'));
  try{
    const store=new CaseStore(directory);const c=store.save(fictionalCase());
    const drafted=store.saveDraft(c.id,'A reviewed complaint',0,true);
    const fields=caseFormValues(drafted);
    store.updateDetails(c.id,{merchant:fields.merchant,amount:fields.amount,currency:fields.currency,cancelled:fields.cancelled,charged:'2026-10-07',evidence:drafted.evidence.map(e=>({...e,merchant:'StreamNest'}))},drafted.revision);
    const reopened=new CaseStore(directory).get(c.id);
    assert.equal(caseFormValues(reopened).charged,'2026-10-07');
    assert.equal(caseFormValues(reopened)['e2-date'],'2026-10-05');
    assert.equal(reopened.draftNeedsReview,true);
    assert.equal(checkEvidence(reopened).ready,false);
    assert.equal(reopened.amount,c.amount);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('correspondence fields restore dates for the selected message only',()=>{
  const c={communications:[{id:'a',sentDate:'2026-10-06',followUpDate:'2026-10-13'},{id:'b'},{kind:'response',replyTo:'a',receivedDate:'2026-10-14'}]};
  assert.deepEqual(correspondenceDates(c,'a'),{'sent-date':'2026-10-06','follow-up-date':'2026-10-13','response-date':'2026-10-14'});
  assert.deepEqual(correspondenceDates(c,'b'),{'sent-date':'','follow-up-date':'','response-date':''});
});

test('unrelated saves retain pending dates while switching cases or messages clears them',()=>{
  const c={id:'case-a',communications:[{id:'a'},{id:'b'}]};
  const pending={caseId:'case-a',messageId:'a',values:{'sent-date':'2026-10-08','follow-up-date':'','response-date':''}};
  assert.deepEqual(restoreDates(c,'a',pending),pending.values);
  assert.equal(restoreDates({...c,id:'case-b'},'a',pending)['sent-date'],'');
  assert.equal(restoreDates(c,'b',pending)['sent-date'],'');
});

test('date display does not depend on local timezone or replace unknown dates',()=>{
  assert.equal(displayDate('2026-10-05'),'5 Oct 2026');
  for(const value of ['',null,'2026-02-30','not a date'])assert.equal(displayDate(value),'Not supplied');
});

test('export availability rejects obsolete approvals and stale or resolved drafts',()=>{
  const c={draft:'reviewed complaint',communications:[{id:'a',approvedAt:'2026-10-17',draftText:'reviewed complaint'}]};
  assert.equal(exportMatchesDraft(c,'a'),true);
  assert.equal(exportMatchesDraft({...c,draft:'new follow-up'},'a'),false);
  assert.equal(exportMatchesDraft({...c,draftNeedsReview:true},'a'),false);
  assert.equal(exportMatchesDraft({...c,researchNeedsReview:true},'a'),false);
  assert.equal(exportMatchesDraft({...c,resolution:{note:'done'}},'a'),false);
  assert.equal(exportMatchesDraft(c,'missing'),false);
});

test('same-day NordVPN intake explains the scope blocker even with legacy summary and confirmation',()=>{
  const session={facts:{merchant:'Nord VPN',amount:'99.95',currency:'USD',cancelled:'2026-10-16',charged:'2026-10-16'},summary:{ready:false,missing:[],issues:['Clarify the dates.']}};
  const state=intakeReadiness(session,true);
  assert.equal(state.canCreate,false);
  assert.match(state.reason,/same date/);
  assert.match(state.reason,/Keep the true dates/);
  const supported={...session,facts:{...session.facts,charged:'2026-10-17'},summary:{ready:true,issues:[],missing:[]}};
  assert.equal(intakeReadiness(supported,false).canCreate,false);
  assert.equal(intakeReadiness(supported,true).canCreate,true);
});
