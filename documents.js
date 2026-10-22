import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {previewEvidence} from './evidence.js';

export function decodeDocument(input){
 if(!input||typeof input.name!=='string'||input.name.length>160||/[\\/\x00-\x1f]/.test(input.name)||!input.name.trim())throw Error('Choose a document with a simple filename of 1–160 characters.');
 if(typeof input.base64!=='string'||input.base64.length>2800000||!input.base64.length||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))throw Error('The file is empty, malformed or larger than the 2 MB demo limit.');
 const bytes=Buffer.from(input.base64,'base64');if(!bytes.length||bytes.length>2*1024*1024)throw Error('Choose a file no larger than 2 MB.');
 const extension=input.name.toLowerCase().split('.').at(-1);
 if(!['txt','pdf'].includes(extension))throw Error('Choose a .txt or text-based .pdf document. Images and scanned PDFs need OCR, which is not enabled.');
 if(extension==='pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')throw Error('This file is not a recognised PDF.');
 return {bytes,file:{name:input.name,mime:extension==='pdf'?'application/pdf':'text/plain',sha256:createHash('sha256').update(bytes).digest('hex'),base64:input.base64,bytes:bytes.length},extension};
}
export function extractPdf(bytes,{timeoutMs=15000}={}){
 return new Promise((resolve,reject)=>{
  const env={};for(const key of ['SystemRoot','SYSTEMROOT','TEMP','TMP','SIR_NODE_MODULES'])if(process.env[key])env[key]=process.env[key];
  const child=execFile(process.execPath,['--max-old-space-size=128',fileURLToPath(new URL('./pdf-worker.js',import.meta.url))],{timeout:timeoutMs,maxBuffer:250000,windowsHide:true,env},(error,stdout)=>{
    if(error)return reject(Error(error.killed?'PDF processing took too long. Use a shorter document or paste its text.':'PDF processing failed safely. Try a smaller PDF or paste its text.'));
    try{const result=JSON.parse(stdout);if(result.error)reject(Error(result.error));else resolve(result);}catch{reject(Error('PDF processing returned unreadable text. Paste a transcription instead.'));}
  });
  child.stdin.on('error',()=>{});child.stdin.end(bytes);
 });
}
export class DocumentIntake {
 constructor({extractPdfImpl=extractPdf,now=()=>Date.now()}={}){this.extractPdf=extractPdfImpl;this.now=now;this.pending=new Map();this.processing=false;}
 clean(){for(const [id,p] of this.pending)if(p.expiresAt<=this.now())this.pending.delete(id);}
 async preview(caseId,revision,input){
  this.clean();if(this.processing)throw Error('Another document is being processed. Try again in a moment.');if(this.pending.size>=10)throw Error('There are too many pending documents. Save one or wait 15 minutes.');
  const {bytes,file,extension}=decodeDocument(input);let extracted;
  this.processing=true;
  try{
   if(extension==='pdf')extracted=await this.extractPdf(bytes);
   else{let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Use a UTF-8 plain-text file or paste the text.');}if(text.includes('\0'))throw Error('This file contains binary data. Choose a plain-text document.');extracted={text,pages:[]};}
   const preview=previewEvidence({title:input.name,type:input.type,text:extracted.text});
   const id=randomUUID();this.pending.set(id,{caseId,revision,expiresAt:this.now()+15*60*1000,source:preview.source,file:{...file,pages:extracted.pages}});
   return {...preview,uploadId:id,file:{name:file.name,bytes:file.bytes,sha256:file.sha256,pages:extracted.pages.length},limitation:preview.limitation+' Original bytes are retained only when you save the reviewed evidence.'};
  }finally{this.processing=false;}
 }
 attach(caseId,revision,input){
  this.clean();const pending=this.pending.get(input.uploadId);
  if(!pending||pending.caseId!==caseId||pending.revision!==revision)throw Error('The document preview expired or this case changed. Upload it again before saving.');
  if(input.text!==pending.source.text||input.title!==pending.source.title||input.type!==pending.source.type)throw Error('The document text changed after extraction. Upload it again, or save edited text as separate pasted evidence.');
  return {...input,documentFile:pending.file};
 }
 saved(id){this.pending.delete(id);}
}
