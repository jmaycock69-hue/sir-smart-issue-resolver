// Run from a fresh extracted package: npm run verify:release
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {demoMessages} from './demo-provider.js';
const directory=mkdtempSync(join(tmpdir(),'sir-release-'));
let child,url,output='';
async function start(){
 output='';url=null;
 child=spawn(process.execPath,['server.js','--demo'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',SIR_DATA_DIR:directory,SIR_DEMO_MODE:'scripted',OPENAI_API_KEY:'',SIR_AI_MODEL:'',SIR_NODE_MODULES:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Server did not start: '+output)),10000);
  child.stdout.on('data',b=>{output+=b;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){url=match[0];clearTimeout(timer);resolve();}});
  child.stderr.on('data',b=>{output+=b;});child.once('error',reject);child.once('exit',code=>{if(!url){clearTimeout(timer);reject(Error('Server exited: '+code+' '+output));}});
 });
}
async function stop(){if(child&&child.exitCode===null){const p=new Promise(r=>child.once('exit',r));child.kill();await p;}}
async function request(path,method='GET',body,expected=200,headers={}){
 const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',Origin:url,...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
 const text=await response.text();assert.equal(response.status,expected,path+': '+text);return response.headers.get('content-type')?.includes('json')?JSON.parse(text):text;
}
try{
 await start();const status=await request('/api/ai/status');assert.equal(status.mode,'scripted');assert.deepEqual(await request('/api/cases'),[]);
 let intake=await request('/api/intakes','POST');
 for(const message of demoMessages)intake=await request('/api/intakes/'+intake.id+'/turn','POST',{revision:intake.revision,message,shareConfirmed:true});
 let c=await request('/api/intakes/'+intake.id+'/commit','POST',{revision:intake.revision,confirmed:true});
 await request('/api/cases/'+c.id+'/draft','POST',{revision:c.revision||0},400);
 const record='FICTIONAL DEMONSTRATION RECORD\nMerchant: Acorn Outdoor Supplies\nDate: 2026-10-01\nAmount: GBP 89.00\nItem: camping stove';
 const preview=await request('/api/documents/preview','POST',{caseId:c.id,revision:c.revision||0,name:'fictional-order.txt',type:'order',base64:Buffer.from(record).toString('base64')});
 c=await request('/api/cases/'+c.id+'/evidence','POST',{revision:c.revision||0,uploadId:preview.uploadId,type:'order',title:'fictional-order.txt',text:record,confirmed:true,facts:{merchant:c.merchant,date:'2026-10-01',amount:'',currency:'',dateRole:'charged'}});
 c=await request('/api/cases/'+c.id+'/draft','POST',{revision:c.revision});
 await request('/api/cases/'+c.id+'/approve','POST',{revision:c.revision,recipient:'complaints@acorn.example',subject:'Demo complaint',kind:'complaint',approved:false},400);
 c=await request('/api/cases/'+c.id+'/approve','POST',{revision:c.revision,recipient:'complaints@acorn.example',subject:'Demo complaint',kind:'complaint',approved:true});const obsolete=c.communications.at(-1).id;
 c=await request('/api/cases/'+c.id,'PUT',{...c,desiredOutcome:'Please refund GBP 89.00 and explain the failed delivery.',revision:c.revision});assert.equal(c.draftNeedsReview,true);
 await request('/api/cases/'+c.id+'/email-export?messageId='+obsolete,'GET',undefined,400);
 c=await request('/api/cases/'+c.id+'/regenerate','POST',{revision:c.revision});assert.match(c.draft,/explain the failed delivery/);assert.ok(c.draftHistory.length);
 c=await request('/api/cases/'+c.id+'/approve','POST',{revision:c.revision,recipient:'complaints@acorn.example',subject:'Revised fictional complaint',kind:'complaint',approved:true});const messageId=c.communications.at(-1).id;
 const eml=await request('/api/cases/'+c.id+'/email-export?messageId='+messageId);const file=join(directory,'verified-export.eml');writeFileSync(file,eml);const downloaded=readFileSync(file,'utf8');
 assert.match(downloaded,/X-Unsent: 1/);assert.match(downloaded,/To: complaints@acorn.example/);const body=Buffer.from(downloaded.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString('utf8');assert.match(body,/explain the failed delivery/);assert.match(body,/fictional-order.txt/);assert.equal(c.communications.at(-1).sentDate,null);
 for(const path of ['/server.js','/.env','/data/','/vendor/pdfjs/pdf.mjs'])await request(path,'GET',undefined,404);
 await request('/api/cases','GET',undefined,400,{Origin:'https://unrelated.example'});
 await request('/api/cases/'+c.id+'/research-preview','POST',{revision:c.revision,url:'https://example.com'},400);
 c=await request('/api/cases/'+c.id+'/export-request','POST',{revision:c.revision,messageId});assert.equal(c.communications.at(-1).sentDate,null);
 const merchantReply='Fictional test response: Acorn Outdoor Supplies acknowledges that order ACORN-1042 has not been delivered. The company is investigating and expects to provide an update within seven days.';
 await request('/api/cases/'+c.id+'/response','POST',{revision:c.revision,messageId,receivedDate:'2026-10-20',text:merchantReply},400);
 c=await request('/api/cases/'+c.id+'/sent','POST',{revision:c.revision,messageId,sentDate:'2026-10-20',followUpDate:'2026-10-28',confirmed:true});
 c=await request('/api/cases/'+c.id+'/response','POST',{revision:c.revision,messageId,receivedDate:'2026-10-20',text:merchantReply});
 assert.equal(c.progress.status,'response-received');
 await stop();await start();const restored=await request('/api/cases/'+c.id);assert.equal(restored.draft,c.draft);assert.equal(restored.documents.length,1);assert.equal(restored.communications.at(-1).body,merchantReply);assert.equal(restored.communications.at(-1).replyTo,messageId);assert.equal((await request('/api/intakes/'+intake.id)).caseId,c.id);
 console.log('PASS: clean scripted intake, reviewed document, drafting, stale export blocking, regeneration, approved .eml bytes, export-versus-sent gates, merchant response, origin/source restrictions and persistence after server restart. No API key used.');
}finally{await stop();rmSync(directory,{recursive:true,force:true});}
