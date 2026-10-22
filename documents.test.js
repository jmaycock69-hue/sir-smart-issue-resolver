import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeDocument,DocumentIntake,extractPdf} from './documents.js';
import {CaseStore,fictionalCase,createCase,draftComplaint,checkEvidence} from './core.js';
const text='Merchant: StreamNest\nCancellation effective date: 2026-09-28';
const input=()=>({name:'fictional-cancellation.txt',type:'cancellation',base64:Buffer.from(text).toString('base64')});
// Small in-memory PDF fixture. No user-facing PDF artifact is produced.
function textPdf(lines=[],pageCount=1){
 const stream='BT /F1 12 Tf 50 750 Td '+lines.map((line,i)=>(i?'0 -20 Td ':'')+'('+line.replace(/[()\\]/g,'\\$&')+') Tj').join('\n')+' ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:pageCount},(_,i)=>(5+i)+' 0 R').join(' ')}] /Count ${pageCount} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,...Array.from({length:pageCount},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>')];
 let result='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(result));result+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});const xref=Buffer.byteLength(result);result+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(result);
}
test('text document preview is local and retains exact original bytes only after review',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sir-doc-'));try{const store=new CaseStore(dir);const c=store.save(fictionalCase());const docs=new DocumentIntake();const preview=await docs.preview(c.id,0,input());assert.equal(preview.candidates.merchant.value,'StreamNest');assert.equal(store.get(c.id).documents,undefined);const payload={...preview.source,uploadId:preview.uploadId,confirmed:true,facts:{merchant:'StreamNest',date:'2026-09-28'}};const attached=docs.attach(c.id,0,payload);const saved=store.saveReviewedEvidence(c.id,attached,0,attached.documentFile);docs.saved(preview.uploadId);assert.equal(Buffer.from(saved.documents[0].file.base64,'base64').toString(),text);assert.equal(saved.documents[0].file.sha256.length,64);assert.equal(new CaseStore(dir).get(c.id).documents[0].file.name,input().name);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('document previews are case and revision bound; expiry and text tampering are rejected',async()=>{
 let now=1;const docs=new DocumentIntake({now:()=>now});const preview=await docs.preview('case-one',2,input());const payload={...preview.source,uploadId:preview.uploadId};assert.throws(()=>docs.attach('case-two',2,payload),/changed/);assert.throws(()=>docs.attach('case-one',3,payload),/changed/);assert.throws(()=>docs.attach('case-one',2,{...payload,text:'altered'}),/changed/);now+=15*60*1000;assert.throws(()=>docs.attach('case-one',2,payload),/expired/);
});
test('unsupported, disguised, malformed and oversized files are rejected',()=>{
 for(const file of [{...input(),name:'../escape.txt'},{...input(),name:'image.png'},{...input(),name:'not-real.pdf'},{...input(),base64:'%%%'},{...input(),base64:Buffer.alloc(2*1024*1024+1).toString('base64')}])assert.throws(()=>decodeDocument(file));
});
test('invalid UTF-8 and binary text files fail with recoverable errors',async()=>{
 const docs=new DocumentIntake();for(const bytes of [Buffer.from([255,254,0]),Buffer.from('text\0binary')])await assert.rejects(docs.preview('case',0,{...input(),base64:bytes.toString('base64')}));assert.equal(docs.processing,false);
});
test('PDF worker extracts page-referenced text from a real PDF fixture',async t=>{
 if(!process.env.SIR_NODE_MODULES){try{await import('./vendor/pdfjs/pdf.mjs');}catch{t.skip('Optional PDF dependency not installed');return;}}
 const bytes=textPdf(text.split('\n'));const result=await extractPdf(bytes);assert.match(result.text,/Merchant: StreamNest/);assert.equal(result.pages[0].number,1);assert.match(result.pages[0].text,/2026-09-28/);
 const docs=new DocumentIntake();const preview=await docs.preview('case',0,{name:'confirmation.pdf',type:'cancellation',base64:bytes.toString('base64')});assert.equal(preview.candidates.date.value,'2026-09-28');assert.equal(preview.file.pages,1);
});
test('empty/scanned and excessive-page PDFs fail without becoming evidence',async t=>{
 if(!process.env.SIR_NODE_MODULES){try{await import('./vendor/pdfjs/pdf.mjs');}catch{t.skip('Optional PDF dependency not installed');return;}}
 await assert.rejects(extractPdf(textPdf()),/no readable text/);await assert.rejects(extractPdf(textPdf(['fixture'],21)),/20 pages/);
});

test('Acorn text PDF extracts merchant, order date and amount, retains bytes and drafts without comparing order to payment',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sir-acorn-pdf-'));try{
  const store=new CaseStore(dir);let c=store.save(createCase({caseType:'general',merchant:'Acorn Outdoor Supplies',issue:'The camping stove was never delivered.',desiredOutcome:'Refund GBP 89.00',amount:'89.00',currency:'GBP',charged:'2026-10-02',reference:'ACORN-1042'}));
  const bytes=textPdf(['Order confirmation','Acorn Outdoor Supplies','Order reference: ACORN-1042','Order date: 2026-10-01','Product: camping stove','Amount paid: GBP 89.00','Payment status: paid','Delivery status: awaiting delivery']);
  const docs=new DocumentIntake();const preview=await docs.preview(c.id,0,{name:'fictional-acorn-order.pdf',type:'order',base64:bytes.toString('base64')});
  assert.equal(preview.candidates.merchant.value,'Acorn Outdoor Supplies');assert.equal(preview.candidates.date.value,'2026-10-01');assert.equal(preview.candidates.date.role,'none');assert.equal(preview.candidates.amount.value,'89.00');
  const facts=Object.fromEntries(['merchant','date','amount','currency','reference'].map(k=>[k,preview.candidates[k].value]));
  const attached=docs.attach(c.id,0,{...preview.source,uploadId:preview.uploadId,confirmed:true,facts,dateRole:preview.candidates.date.role});
  c=store.saveReviewedEvidence(c.id,attached,0,attached.documentFile);docs.saved(preview.uploadId);
  assert.equal(checkEvidence(c).ready,true);assert.equal(checkEvidence(c).comparisons.some(row=>row.label==='Payment or charge date'),false);
  c=store.saveDraft(c.id,draftComplaint(c),c.revision,true);const reopened=new CaseStore(dir).get(c.id);
  assert.deepEqual(Buffer.from(reopened.documents[0].file.base64,'base64'),bytes);assert.match(reopened.draft,/ACORN-1042/);assert.match(reopened.draft,/fictional-acorn-order.pdf/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
