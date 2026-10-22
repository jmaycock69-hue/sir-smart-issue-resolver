import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log=()=>{};console.warn=()=>{};
const emit=value=>process.stdout.write(JSON.stringify(value));
try {
 const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>2*1024*1024)throw Error('This PDF is too large.');chunks.push(chunk);}const data=Buffer.concat(chunks);
 let pdfjs;
 try { pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'); }
 catch(error){
   if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
   try{pdfjs=await import('./vendor/pdfjs/pdf.mjs');}
   catch{
    if(!process.env.SIR_NODE_MODULES)throw Error('PDF support is not installed. Restore the bundled PDF runtime or paste document text instead.');
    const require=createRequire(join(process.env.SIR_NODE_MODULES,'sir-resolve.cjs'));
    pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
   }
 }
 const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,disableFontFace:true,stopAtErrors:true,verbosity:0});
 let doc;
 try{
  doc=await task.promise;
  if(doc.numPages>20)throw Error('This demo accepts PDFs up to 20 pages. Supply a shorter excerpt.');
  const pages=[];let length=0;
  for(let number=1;number<=doc.numPages;number++){
   const page=await doc.getPage(number);const content=await page.getTextContent();let text='';
   for(const item of content.items){if(typeof item.str!=='string')continue;text+=item.str+(item.hasEOL?'\n':' ');if(length+text.length>30000)throw Error('The extracted PDF text is too long. Supply a shorter excerpt.');}
   text=text.trim();length+=text.length;pages.push({number,text});page.cleanup();
  }
  if(!pages.some(page=>page.text.trim()))throw Error('This PDF has no readable text layer. Scanned PDFs need OCR; paste a transcription instead.');
  emit({pages,text:pages.map(p=>p.text).join('\n\n')});
 }finally{await doc?.destroy();if(!doc)await task.destroy();}
}catch(error){emit({error:error.name==='PasswordException'?'Password-protected PDFs are not supported. Supply an unlocked fictional copy.':error.message?.startsWith('This ')||error.message?.startsWith('PDF support')||error.message?.startsWith('The extracted')?error.message:'The PDF could not be read. Try an unencrypted text PDF or paste the text.'});}
