import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DocumentIntake} from './documents.js';
import {previewEvidence} from './evidence.js';
import {checkGeneralEvidence} from './complaint-model.js';

test('the supplied Acorn PDF suggests its business heading and keeps original bytes',async()=>{
 const bytes=readFileSync(new URL('./fixtures/Acorn_Order_Confirmation.pdf',import.meta.url));
 const result=await new DocumentIntake().preview('fictional-case',0,{name:'Acorn_Order_Confirmation.pdf',type:'order',base64:bytes.toString('base64')});
 assert.equal(result.candidates.merchant.value,'ACORN OUTDOOR SUPPLIES');
 assert.equal(result.candidates.reference.value,'ACORN-1042');
 assert.equal(result.candidates.amount.value,'89.00');
 assert.equal(result.candidates.currency.value,'GBP');
 assert.equal(result.file.bytes,bytes.length);
 assert.match(result.source.text,/ACORN OUTDOOR SUPPLIES [-–—] Order confirmation/);
});
test('heading suffix removal does not invent a merchant or hide conflicting labels',()=>{
 assert.equal(previewEvidence({title:'Test',type:'order',text:'Order confirmation\nOrder reference: ACORN-1042'}).candidates.merchant.value,'');
 const c=previewEvidence({title:'Test',type:'order',text:'Acorn Outdoor Supplies - Order confirmation\nMerchant: Other Store\nMerchant: Third Store\nOrder reference: ACORN-1042'}).candidates.merchant;
 assert.equal(c.value,'');assert.equal(c.ambiguous,true);
});
test('company typography is equivalent while different names and order references still conflict',()=>{
 const c={caseType:'general',merchant:'Acorn Outdoor Supplies',issue:'My camping stove never arrived.',desiredOutcome:'Refund GBP 89.00.',reference:'ACORN-1042',evidence:[{id:'G1',type:'order',merchant:'ACORN OUTDOOR SUPPLIES',reference:'ACORN-1042',dateRole:'none',text:'Fictional order record',date:'',amount:'',currency:''}]};
 assert.equal(checkGeneralEvidence(c).ready,true);
 assert.equal(checkGeneralEvidence({...c,evidence:[{...c.evidence[0],merchant:'Other Outdoor Supplies'}]}).ready,false);
 assert.equal(checkGeneralEvidence({...c,evidence:[{...c.evidence[0],reference:'acorn-1042'}]}).ready,false);
});
