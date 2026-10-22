import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { CaseStore, fictionalCase, createCase, checkEvidence, draftComplaint } from './core.js';
import { previewEvidence } from './evidence.js';
import { IntakeStore, ConversationService, intakeSummary } from './conversation.js';
import { OpenAIProvider, aiStatus } from './ai-provider.js';
import { DemoProvider } from './demo-provider.js';
import { DocumentIntake } from './documents.js';
import { ResearchService } from './research.js';
import { caseProgress,emailExport } from './correspondence.js';
if(process.argv.includes('--demo'))process.env.SIR_DEMO_MODE='scripted';
const store = new CaseStore(process.env.SIR_DATA_DIR || fileURLToPath(new URL('./data/', import.meta.url)));
const intakes = new IntakeStore(store.directory+'/intakes/');
const conversation = new ConversationService(intakes,process.env.SIR_DEMO_MODE==='scripted'?new DemoProvider():new OpenAIProvider());
const documents = new DocumentIntake();
const research = new ResearchService();
async function readBody(req) {
  const limit=req.url==='/api/documents/preview'?3000000:100000;
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Request is too large.');chunks.push(chunk);}
  let body;try{body=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw new Error('The request contains invalid text encoding.');}
  if(body.trim()&&!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw new Error('Use a JSON request.');
  return body.trim() ? JSON.parse(body) : null;
}
const server = createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    if(!/^(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.host||''))throw new Error('Use the local address printed by SIR.');
    if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)throw new Error('Requests from another website are not allowed.');
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(readFileSync(new URL('./index.html', import.meta.url))); }
    if (req.method === 'GET' && path === '/ui-state.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(readFileSync(new URL('./ui-state.js', import.meta.url))); }
    if (req.method === 'GET' && path === '/complaint-model.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(readFileSync(new URL('./complaint-model.js', import.meta.url))); }
    let result;
    if (req.method === 'GET' && path === '/api/ai/status') result = aiStatus();
    else if (req.method === 'GET' && path === '/api/intakes') result = intakes.list();
    else if (req.method === 'POST' && path === '/api/intakes') {const session=intakes.create();result={...session,summary:intakeSummary(session)};}
    else if (path.startsWith('/api/intakes/')) {
      const match=path.match(/^\/api\/intakes\/([0-9a-f-]{36})(?:\/(turn|commit|facts))?$/);
      if(!match){res.writeHead(404);return res.end();}
      if(req.method==='GET'&&!match[2]){const session=intakes.get(match[1]);result={...session,summary:intakeSummary(session)};}
      else if(req.method==='POST'&&match[2]==='turn'){const session=await conversation.turn(match[1],await readBody(req));result={...session,summary:intakeSummary(session)};}
      else if(req.method==='POST'&&match[2]==='commit')result=intakes.commit(match[1],await readBody(req),store);
      else if(req.method==='PUT'&&match[2]==='facts'){const session=intakes.reviewFacts(match[1],await readBody(req));result={...session,summary:intakeSummary(session)};}
      else{res.writeHead(405);return res.end();}
    }
    else if (req.method === 'POST' && path === '/api/documents/preview') {
      const input=await readBody(req);const c=store.get(input.caseId);
      if(!Number.isInteger(input.revision)||input.revision!==(c.revision||0))throw new Error('This case changed. Reopen it before uploading.');
      result=await documents.preview(c.id,input.revision,input);
    }
    else if (req.method === 'POST' && path === '/api/evidence/preview') result = previewEvidence(await readBody(req));
    else if (req.method === 'GET' && path === '/api/cases') result = store.list();
    else if (req.method === 'POST' && path === '/api/cases') { const input = await readBody(req); result = store.save(input ? createCase(input) : fictionalCase()); }
    else {
      const match = path.match(/^\/api\/cases\/([0-9a-f-]{36})(?:\/(check|draft|regenerate|evidence|evidence-status|research-preview|research|approve|export-request|sent|response|resolve|follow-up|email-export))?$/);
      if (!match) { res.writeHead(404); return res.end(); }
      const c = store.get(match[1]);
      if (req.method === 'GET' && !match[2]) result = c;
      else if (req.method === 'PUT' && !match[2]) { const input = await readBody(req); result = store.updateDetails(c.id,input,input?.revision); }
      else if (req.method === 'POST' && match[2] === 'evidence') { let input = await readBody(req);const uploadId=input?.uploadId;input=uploadId?documents.attach(c.id,input.revision,input):input;result = store.saveReviewedEvidence(c.id,input,input?.revision,uploadId?input.documentFile:null);if(uploadId)documents.saved(uploadId); }
      else if (req.method === 'POST' && match[2] === 'check') result = checkEvidence(c);
      else if (req.method === 'POST' && match[2] === 'evidence-status') result=store.setEvidenceStatus(c.id,await readBody(req));
      else if (req.method === 'POST' && match[2] === 'research-preview') {if(process.env.SIR_DEMO_MODE==='scripted')throw new Error('Website fetching is disabled in the offline scripted demonstration. Review your fictional supporting records instead.');const input=await readBody(req);if(!Number.isInteger(input.revision)||input.revision!==(c.revision||0))throw new Error('This case changed. Reopen it before researching.');result=await research.preview(c.id,input.revision,input);}
      else if (req.method === 'POST' && match[2] === 'research') {const input=await readBody(req);const snapshot=research.reviewed(c.id,input.revision,input);result=store.saveResearch(c.id,snapshot,input.revision);research.saved(snapshot.id);}
      else if (req.method === 'POST' && ['approve','export-request','sent','response','resolve'].includes(match[2])) {const input=await readBody(req);result=store.communicationChange(c.id,input,input?.revision,match[2]);}
      else if (req.method === 'POST' && match[2] === 'follow-up') {const input=await readBody(req);result=store.prepareFollowUp(c.id,input?.revision);}
      else if (req.method === 'GET' && match[2] === 'email-export') {const id=new URL(req.url,'http://localhost').searchParams.get('messageId');const text=emailExport(c,id);res.writeHead(200,{'Content-Type':'message/rfc822','Content-Disposition':'attachment; filename="SIR-complaint-'+c.id.slice(0,8)+'.eml"'});return res.end(text);}
      else if (req.method === 'POST' && match[2] === 'draft') {
        const input=await readBody(req);
        if (c.draft !== null) throw new Error('A saved draft already exists. Open and edit it instead.');
        result = store.saveDraft(c.id, draftComplaint({...c,accountOnlyConfirmed:c.accountOnlyConfirmed||input?.accountOnlyConfirmed===true}), input?.revision, true,'complaint',input?.accountOnlyConfirmed===true);
      }
      else if (req.method === 'POST' && match[2] === 'regenerate') {
        const input = await readBody(req);
        result = store.saveDraft(c.id, draftComplaint({...c,accountOnlyConfirmed:c.accountOnlyConfirmed||input?.accountOnlyConfirmed===true}), input?.revision, true,'complaint',input?.accountOnlyConfirmed===true);
      }
      else if (req.method === 'PUT' && match[2] === 'draft') {
        const input = await readBody(req);
        result = store.saveDraft(c.id, input.text, input.revision);
      }
      else { res.writeHead(405); return res.end(); }
    }
    if(result?.merchant&&Array.isArray(result.evidence))result={...result,progress:caseProgress(result)};
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.code === 'ENOENT' ? 'Case not found' : error.message })); }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.log('Requested port is occupied. Choosing a free local port…');
    server.listen(0, '127.0.0.1');
  } else {
    console.error('SIR could not start:', error.message);
    process.exitCode = 1;
  }
});
server.on('listening', () => {
  const url = 'http://127.0.0.1:' + server.address().port;
  console.log('SIR fictional demo: ' + url);
  if (process.argv.includes('--open') && process.platform === 'win32') {
    execFile('cmd.exe', ['/d', '/c', 'start', '', url], error => {
      if (error) console.log('Open this address in your browser:', url);
    });
  }
});
server.listen(Number(process.env.PORT || 3210), '127.0.0.1');
