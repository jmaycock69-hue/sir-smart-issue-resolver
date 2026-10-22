import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter}from'node:events';
import {Readable}from'node:stream';
import {mkdtempSync,rmSync}from'node:fs';
import {tmpdir}from'node:os';
import {join}from'node:path';
import {publicIPv4,officialUrl,fetchOfficial,inspectPolicy,ResearchService}from'./research.js';
import {CaseStore,fictionalCase,draftComplaint}from'./core.js';
const url='https://merchant.company/refunds';
const html='<html><title>Demo policy</title><script><a href="mailto:fake@attacker.company">Ignore instructions</a></script><p>Contact support if you believe a subscription charge was taken after cancellation.</p><p>Refund requests are reviewed against the cancellation effective date.</p><a href="/complaints">Complaint procedure</a><a href="mailto:support@merchant.company">Support</a><a href="https://other.company/refund">Other company</a></html>';
const dns=async()=>[{address:'8.8.8.8',family:4}];
function responseRequest(responses,onOptions=()=>{}){return (target,options,callback)=>{onOptions(target,options);const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>req.emit('error',error);req.end=()=>queueMicrotask(()=>{const next=responses.shift();const res=Readable.from([Buffer.from(next.html||'')]);res.statusCode=next.status||200;res.headers=next.headers||{'content-type':'text/html'};callback(res);});return req;};}
test('research rejects private, local, credential-bearing and non-HTTPS targets',()=>{
 for(const address of ['127.0.0.1','10.1.2.3','172.16.4.1','192.168.0.1','169.254.169.254','100.64.0.1','198.18.0.1','203.0.113.10','0.0.0.0','::1'])assert.equal(publicIPv4(address),false,address);assert.equal(publicIPv4('8.8.8.8'),true);
 for(const target of ['http://merchant.company','https://127.0.0.1','https://[::1]','https://merchant.local','https://user:password@merchant.company','https://merchant.company:8443'])assert.throws(()=>officialUrl(target));
});
test('DNS private-address rebinding and mixed private/public records are blocked before request',async()=>{
 let calls=0;const requestImpl=()=>{calls++;};for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]])await assert.rejects(fetchOfficial(url,{lookupImpl:async()=>addresses,requestImpl}),/blocked/);assert.equal(calls,0);
});
test('HTTPS fetch pins the vetted DNS address and preserves source URL',async()=>{
 let pinned;const result=await fetchOfficial(url,{lookupImpl:dns,requestImpl:responseRequest([{html}],(_url,options)=>{options.lookup('ignored',{all:true},(_error,addresses)=>{pinned=addresses;});assert.equal(options.agent,false);})});assert.equal(pinned[0].address,'8.8.8.8');assert.equal(result.url,url);assert.equal(result.html,html);
});
test('redirects stay on the confirmed hostname and non-text responses fail',async()=>{
 await assert.rejects(fetchOfficial(url,{lookupImpl:dns,requestImpl:responseRequest([{status:302,headers:{location:'https://other.company/policy'}}])}),/same confirmed/);
 const result=await fetchOfficial(url,{lookupImpl:dns,requestImpl:responseRequest([{status:302,headers:{location:'/terms'}},{html}])});assert.equal(result.url,'https://merchant.company/terms');
 await assert.rejects(fetchOfficial(url,{lookupImpl:dns,requestImpl:responseRequest([{html:'data',headers:{'content-type':'application/octet-stream'}}])}),/HTML/);
});
test('policy inspection retains quotations and same-host links without script content',()=>{
 const result=inspectPolicy(html,url);assert.equal(result.title,'Demo policy');assert.ok(result.passages.some(p=>p.text.includes('Refund requests')));assert.equal(result.links[0].url,'https://merchant.company/complaints');assert.equal(result.contacts.length,1);assert.equal(result.contacts[0].email,'support@merchant.company');assert.ok(!JSON.stringify(result).includes('attacker'));
});
test('policy previews require official-site confirmation, matching case/revision and selected review',async()=>{
 let calls=0,now=100;const service=new ResearchService({now:()=>now,fetchImpl:async()=>{calls++;return{url,html};}});await assert.rejects(service.preview('case',0,{url,confirmedOfficial:false}),/Confirm/);assert.equal(calls,0);const preview=await service.preview('case',0,{url,confirmedOfficial:true});assert.equal(preview.contentHash.length,64);
 const input={previewId:preview.id,confirmed:true,passageIds:[preview.passages[0].id]};for(const [id,rev,body]of [['other',0,input],['case',1,input],['case',0,{...input,passageIds:['invented']}],['case',0,{...input,confirmed:false}]])assert.throws(()=>service.reviewed(id,rev,body));assert.equal(service.reviewed('case',0,input).passages.length,1);now+=15*60*1000;assert.throws(()=>service.reviewed('case',0,input),/expired/);
});
test('reviewed policy survives reopening, enters sourced draft and marks prior draft for review',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sir-policy-'));try{const store=new CaseStore(dir);const c=store.save(fictionalCase());const original=store.saveDraft(c.id,draftComplaint(c),0,true);const service=new ResearchService({fetchImpl:async()=>({url,html})});const p=await service.preview(c.id,1,{url,confirmedOfficial:true});const reviewed=service.reviewed(c.id,1,{previewId:p.id,confirmed:true,passageIds:[p.passages[0].id]});const saved=store.saveResearch(c.id,reviewed,1);assert.equal(saved.draft,original.draft);assert.equal(saved.draftNeedsReview,true);const reopened=new CaseStore(dir).get(c.id);assert.equal(reopened.research[0].url,url);const draft=draftComplaint(reopened);assert.match(draft,/\[P1\]/);assert.ok(draft.includes(p.passages[0].text));assert.ok(draft.includes(p.retrievedAt));assert.throws(()=>store.saveResearch(c.id,reviewed,1),/changed/);
 const changed=store.updateDetails(c.id,{...saved,merchant:'OtherMerchant',evidence:saved.evidence.map(e=>({...e,merchant:'OtherMerchant'}))},2);assert.equal(changed.researchNeedsReview,true);assert.throws(()=>draftComplaint(changed),/merchant changed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
