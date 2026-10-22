import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CaseStore,checkEvidence,draftComplaint} from './core.js';
import {IntakeStore,ConversationService,intakeSummary} from './conversation.js';
import {OpenAIProvider,aiStatus} from './ai-provider.js';
const message='DemoVPN charged USD 49.99 on 2026-10-03 after my cancellation effective 2026-09-06.';
const complete=()=>({reply:'Please review these proposed facts, then supply independent evidence.',updates:Object.entries({merchant:'DemoVPN',amount:'49.99',currency:'USD',cancelled:'2026-09-06',charged:'2026-10-03'}).map(([field,value])=>({field,value,quote:message}))});
async function stores(fn){const dir=mkdtempSync(join(tmpdir(),'sir-intake-'));try{const intakes=new IntakeStore(join(dir,'intakes'));const cases=new CaseStore(join(dir,'cases'));await fn(intakes,cases,dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('conversation reaches reviewed case without inventing evidence and survives fresh stores',()=>stores(async(s,cases,dir)=>{
 const session=s.create({version:1});assert.equal(intakeSummary(session).missing.length,5);const service=new ConversationService(s,{respond:async()=>complete()});const updated=await service.turn(session.id,{revision:0,message,shareConfirmed:true});assert.equal(intakeSummary(updated).ready,true);assert.equal(cases.list().length,0);
 const reopened=new IntakeStore(join(dir,'intakes')).get(session.id);assert.equal(reopened.messages.length,2);assert.equal(s.list()[0].merchant,'DemoVPN');assert.throws(()=>s.commit(session.id,{revision:1,confirmed:false},cases),/confirm/);
 const c=s.commit(session.id,{revision:1,confirmed:true},cases);assert.equal(c.merchant,'DemoVPN');assert.equal(c.evidence.length,0);assert.equal(c.claimProvenance[0].updates.length,5);assert.equal(checkEvidence(c).ready,false);assert.throws(()=>draftComplaint(c),/missing/);assert.equal(new CaseStore(join(dir,'cases')).get(c.id).conversation[0].text,message);
 assert.equal(s.commit(session.id,{revision:2,confirmed:true},cases).id,c.id);assert.equal(cases.list().length,1);
}));
test('partial conversation reports missing fields and accepts a sourced correction',()=>stores(async(s)=>{
 const session=s.create({version:1});s.saveTurn(session.id,0,'Merchant is DemoVPN',{reply:'What amount and dates?',updates:[{field:'merchant',value:'DemoVPN',quote:'Merchant is DemoVPN'}]});assert.equal(intakeSummary(s.get(session.id)).missing.length,4);
 const corrected=s.saveTurn(session.id,1,'Correction: merchant is OtherVPN',{reply:'I have proposed that correction.',updates:[{field:'merchant',value:'OtherVPN',quote:'merchant is OtherVPN'}]});assert.equal(corrected.facts.merchant,'OtherVPN');assert.equal(corrected.proposals[0].updates[0].value,'DemoVPN');
}));
test('invalid, unsupported and unquoted AI updates never change the saved conversation',()=>stores(async(s)=>{
 for(const mutate of [o=>o.updates[0].field='sendEmail',o=>o.updates[0].quote='invented source',o=>o.updates[1].value='-1.00',o=>o.updates[3].value='2026-02-30',o=>o.updates.push(o.updates[0]),o=>o.action='send']){const session=s.create({version:1});const output=complete();mutate(output);assert.throws(()=>s.saveTurn(session.id,0,message,output));assert.deepEqual(s.get(session.id),session);}
}));
test('date contradiction prevents committing a case',()=>stores(async(s,cases)=>{
 const session=s.create({version:1});const output=complete();output.updates.find(u=>u.field==='charged').value='2026-09-01';s.saveTurn(session.id,0,message,output);assert.equal(intakeSummary(s.get(session.id)).ready,false);assert.throws(()=>s.commit(session.id,{revision:1,confirmed:true},cases),/clarify/);assert.equal(cases.list().length,0);
}));

test('same-day facts cannot produce a misleading ready-for-review assistant reply',()=>stores(async(s,cases)=>{
 const session=s.create({version:1});const userMessage='Nord VPN charged USD 99.95 on 2026-10-16 and cancellation was effective 2026-10-16.';
 const output={reply:'Everything is ready for review.',updates:Object.entries({merchant:'Nord VPN',amount:'99.95',currency:'USD',cancelled:'2026-10-16',charged:'2026-10-16'}).map(([field,value])=>({field,value,quote:userMessage}))};
 const saved=s.saveTurn(session.id,0,userMessage,output);const summary=intakeSummary(saved);
 assert.equal(summary.ready,false);assert.equal(summary.blockerCode,'same-day-charge');
 assert.match(saved.messages.at(-1).text,/same date/);assert.match(saved.messages.at(-1).text,/Keep the true dates/);
 assert.equal(saved.messages.at(-1).origin,'workflow');
 assert.throws(()=>s.commit(session.id,{revision:1,confirmed:true},cases),/clarify/);
 assert.equal(cases.list().length,0);assert.equal(saved.facts.cancelled,'2026-10-16');
}));
test('consent, empty input and stale revisions reject before model call',()=>stores(async(s)=>{
 const session=s.create({version:1});let calls=0;const service=new ConversationService(s,{respond:async()=>{calls++;return complete();}});
 for(const input of [{revision:0,message,shareConfirmed:false},{revision:0,message:'',shareConfirmed:true},{revision:9,message,shareConfirmed:true}])await assert.rejects(service.turn(session.id,input));assert.equal(calls,0);assert.deepEqual(s.get(session.id),session);
}));
test('late results and simultaneous requests cannot overwrite newer work',()=>stores(async(s)=>{
 const session=s.create({version:1});let release;const service=new ConversationService(s,{respond:()=>new Promise(resolve=>{release=resolve;})});const pending=service.turn(session.id,{revision:0,message,shareConfirmed:true});await assert.rejects(service.turn(session.id,{revision:0,message,shareConfirmed:true}),/already/);
 s.saveTurn(session.id,0,'Merchant is Changed',{reply:'Please clarify.',updates:[{field:'merchant',value:'Changed',quote:'Merchant is Changed'}]});release(complete());await assert.rejects(pending,/changed/);assert.equal(s.get(session.id).facts.merchant,'Changed');assert.equal(service.inFlight.size,0);
}));
test('failed AI calls preserve persisted state and release the operation lock',()=>stores(async(s)=>{
 const session=s.create({version:1});const service=new ConversationService(s,{respond:async()=>{throw Error('Service unavailable');}});await assert.rejects(service.turn(session.id,{revision:0,message,shareConfirmed:true}),/unavailable/);assert.deepEqual(s.get(session.id),session);assert.equal(service.inFlight.size,0);
}));
test('provider status never exposes credentials; structured request disables storage and has no tools',async()=>{
 const env={OPENAI_API_KEY:'fake-test-only-secret',SIR_AI_MODEL:'chosen-test-model'};assert.equal(aiStatus({}).configured,false);assert.ok(!JSON.stringify(aiStatus(env)).includes(env.OPENAI_API_KEY));let request;
 const provider=new OpenAIProvider({env,fetchImpl:async(url,input)=>{request={url,...input};return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(complete())}]}]})};}});assert.deepEqual(await provider.respond({facts:{},messages:[],message}),complete());const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.equal(body.text.format.strict,true);assert.equal(request.url,'https://api.openai.com/v1/responses');
});
test('provider errors and incomplete/refused results fail safely without leaking upstream details',async()=>{
 const env={OPENAI_API_KEY:'fake-test-only-secret',SIR_AI_MODEL:'test'};const context={facts:{},messages:[],message};
 for(const status of [401,429,500]){const p=new OpenAIProvider({env,fetchImpl:async()=>({ok:false,status,text:async()=>env.OPENAI_API_KEY})});await assert.rejects(p.respond(context),e=>!e.message.includes(env.OPENAI_API_KEY));}
 for(const body of [{status:'incomplete'},{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]},{status:'completed',output:[]}]){const p=new OpenAIProvider({env,fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify(body)})});await assert.rejects(p.respond(context));}
});
