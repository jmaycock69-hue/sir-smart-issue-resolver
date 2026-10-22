// Exercise the production request handler with real stores, without opening sockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
import {CaseStore,fictionalCase,createCase,checkEvidence,draftComplaint} from './core.js';
import {IntakeStore,ConversationService,intakeSummary} from './conversation.js';
import {previewEvidence} from './evidence.js';
import {DocumentIntake} from './documents.js';
import {ResearchService} from './research.js';
import {caseProgress,emailExport} from './correspondence.js';

async function appTest(fn){
 const dir=mkdtempSync(join(tmpdir(),'sir-http-'));
 try{
  let handler;
  const serverStub={on(){return this;},listen(){return this;},address(){return {port:3217};}};
  let script=readFileSync(new URL('./server.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  script=script.replace(/const store = .*;/,'const store = suppliedStore;').replace(/const intakes = .*;/,'const intakes = suppliedIntakes;');
  script=script.replaceAll('import.meta.url',JSON.stringify(new URL('./server.js',import.meta.url).href));
  const context={createServer:fn=>{handler=fn;return serverStub;},readFileSync,fileURLToPath,execFile:()=>{},CaseStore,fictionalCase,createCase,checkEvidence,draftComplaint,IntakeStore,ConversationService,intakeSummary,previewEvidence,DocumentIntake,ResearchService,caseProgress,emailExport,
   OpenAIProvider:class{},aiStatus:()=>({configured:false,message:'Offline fixture'}),suppliedStore:new CaseStore(join(dir,'cases')),suppliedIntakes:new IntakeStore(join(dir,'intakes')),process:{env:{},argv:[],platform:'win32'},console:{log(){},error(){}},URL,Buffer,TextDecoder};
  vm.runInNewContext(script,context);
  const request=async(path,method='GET',input,extraHeaders={})=>{
   const req=Readable.from(input===undefined?[]:[Buffer.from(JSON.stringify(input))]);req.url=path;req.method=method;req.headers={host:'127.0.0.1:3217',origin:'http://127.0.0.1:3217','content-type':'application/json',...extraHeaders};
   const response={status:200,headers:{},body:'',setHeader(key,value){this.headers[key]=value;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body=''){this.body=Buffer.isBuffer(body)?body.toString('utf8'):body;}};
   await handler(req,response);try{response.json=JSON.parse(response.body);}catch{}
   return response;
  };
  await fn(request);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const facts={merchant:'Fictional hotel',issue:'The room I booked was unavailable.',desiredOutcome:'Please explain and offer a suitable remedy.'};
test('production routes support reviewed general facts, case creation, account-only draft and unsent export',()=>appTest(async request=>{
 let r=await request('/api/intakes','POST');assert.equal(r.status,200);assert.equal(r.json.schemaVersion,2);const id=r.json.id;
 r=await request('/api/intakes/'+id+'/facts','PUT',{revision:0,confirmed:true,facts});assert.equal(r.status,200);assert.equal(r.json.summary.ready,true);
 r=await request('/api/intakes/'+id+'/commit','POST',{revision:r.json.revision,confirmed:true});assert.equal(r.status,200);assert.equal(r.json.caseType,'general');assert.equal(r.json.evidence.length,0);
 r=await request('/api/cases/'+id+'/draft','POST',{revision:r.json.revision||0});assert.equal(r.status,400);assert.match(r.json.error,/account/);
 r=await request('/api/cases/'+id+'/draft','POST',{revision:0,accountOnlyConfirmed:true});assert.equal(r.status,200);assert.match(r.json.draft,/account only/);assert.equal(r.json.accountOnlyConfirmed,true);
 r=await request('/api/cases/'+id+'/approve','POST',{revision:r.json.revision,recipient:'fictional@example.org',subject:'Hotel complaint',kind:'complaint',approved:true});assert.equal(r.status,200);
 const messageId=r.json.communications[0].id;
 r=await request('/api/cases/'+id+'/email-export?messageId='+messageId);assert.equal(r.status,200);assert.match(r.body,/X-Unsent: 1/);
 r=await request('/api/cases/'+id);assert.equal(r.json.communications[0].sentDate,null);
}));

test('production routes retain source history and require explicit revision-bound evidence exclusion',()=>appTest(async request=>{
 let r=await request('/api/cases','POST',{caseType:'general',...facts,amount:'99.95',currency:'USD'});const id=r.json.id;
 r=await request('/api/cases/'+id+'/evidence','POST',{revision:0,type:'receipt',title:'Fictional wrong receipt',text:'Amount: USD 9.95',confirmed:true,facts:{merchant:'',date:'',amount:'9.95',currency:'USD'}});assert.equal(r.status,200);assert.equal(r.json.evidence[0].id,'G1');
 r=await request('/api/cases/'+id+'/draft','POST',{revision:1,accountOnlyConfirmed:true});assert.equal(r.status,400);assert.match(r.json.error,/conflict/);
 r=await request('/api/cases/'+id+'/evidence-status','POST',{revision:1,evidenceId:'G1',active:false,confirmed:true,reason:'Wrong transaction retained for history.'});assert.equal(r.status,200);assert.equal(r.json.documents.length,1);assert.equal(r.json.evidence[0].active,false);
 r=await request('/api/cases/'+id+'/evidence-status','POST',{revision:1,evidenceId:'G1',active:true,confirmed:true,reason:'Stale retry'});assert.equal(r.status,400);
}));

test('browser modules are served and unrelated origins still fail',()=>appTest(async request=>{
 for(const path of ['/','/ui-state.js','/complaint-model.js']){const r=await request(path);assert.equal(r.status,200);assert.ok(r.body.length>100);}
 const rejected=await request('/api/cases','GET',undefined,{origin:'https://unrelated.example'});assert.equal(rejected.status,400);
}));

test('production routes distinguish export requests, actual sending and the exact Acorn response',()=>appTest(async request=>{
 let r=await request('/api/cases','POST',{caseType:'general',merchant:'Acorn Outdoor Supplies',issue:'Order ACORN-1042 has not arrived.',desiredOutcome:'Refund GBP 89.00'});const id=r.json.id;let c=r.json;
 const post=async(action,input,expected=200)=>{const result=await request('/api/cases/'+id+'/'+action,'POST',{revision:c.revision||0,...input});assert.equal(result.status,expected,result.body);if(result.status===200)c=result.json;return result;};
 await post('draft',{accountOnlyConfirmed:true});await post('approve',{recipient:'complaints@acorn.example',subject:'Fictional Acorn complaint',kind:'complaint',approved:true});const messageId=c.communications[0].id;
 const text='Fictional test response: Acorn Outdoor Supplies acknowledges that order ACORN-1042 has not been delivered. The company is investigating and expects to provide an update within seven days.';
 await post('response',{messageId,receivedDate:'2026-10-20',text},400);assert.equal(c.communications.length,1);
 await post('export-request',{messageId});assert.equal(c.communications[0].sentDate,null);assert.ok(c.communications[0].exportRequestedAt);
 const exportResult=await request('/api/cases/'+id+'/email-export?messageId='+messageId);assert.equal(exportResult.status,200);assert.match(exportResult.body,/X-Unsent: 1/);
 await post('sent',{messageId,sentDate:'2026-10-20',followUpDate:'2026-10-28',confirmed:true});await post('response',{messageId,receivedDate:'2026-10-20',text});
 const restored=await request('/api/cases/'+id);assert.equal(restored.json.progress.status,'response-received');assert.equal(restored.json.communications.at(-1).body,text);assert.equal(restored.json.events.at(-1).type,'response');
}));

test('production response route preserves unsolicited history with no fabricated outgoing message',()=>appTest(async request=>{
 let r=await request('/api/cases','POST',{caseType:'general',...facts});const id=r.json.id;
 r=await request('/api/cases/'+id+'/response','POST',{revision:0,unsolicited:true,messageId:null,receivedDate:'2026-10-20',text:'Fictional unsolicited acknowledgement.'});assert.equal(r.status,200);assert.equal(r.json.communications.length,1);assert.equal(r.json.communications[0].replyTo,null);assert.equal(r.json.progress.status,'response-received');
 const stale=await request('/api/cases/'+id+'/response','POST',{revision:0,unsolicited:true,receivedDate:'2026-10-20',text:'Stale duplicate.'});assert.equal(stale.status,400);
}));
