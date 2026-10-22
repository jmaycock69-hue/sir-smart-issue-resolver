import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { reviewedEvidence } from './evidence.js';
import {isGeneral,generalFields,generalFieldNames,validateGeneralEvidence,checkGeneralEvidence,draftGeneralComplaint} from './complaint-model.js';
import { emailExport,reviewedCorrespondence,recordSent,recordResponse,caseProgress,followUpDraft,draftDisposition } from './correspondence.js';
function event(c,type,text,at=new Date().toISOString()){c.events ||= [];c.events.push({id:randomUUID(),type,text,at,revision:c.revision||0});}

export function fictionalCase() {
  return { id: randomUUID(), fictional: true, merchant: 'StreamNest', amount: '14.99', currency: 'GBP', cancelled: '2026-09-28', charged: '2026-10-05', evidence: [
    { id: 'E1', type: 'cancellation', date: '2026-09-28', text: 'Fictional confirmation: StreamNest subscription cancelled effective 28 September 2026.' },
    { id: 'E2', type: 'receipt', date: '2026-10-05', amount: '14.99', currency: 'GBP', text: 'Fictional receipt: StreamNest subscription charge of GBP 14.99 on 5 October 2026.' }
  ], draft: null };
}
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function intakeFields(input) {
  if (!input || typeof input !== 'object') throw new Error('Case details are required.');
  const { merchant, amount, currency, cancelled, charged, evidenceIds } = input;
  if (typeof merchant !== 'string' || !merchant.trim() || merchant.length > 100) throw new Error('Enter a merchant name of 1–100 characters.');
  if (typeof amount !== 'string' || !/^(0|[1-9]\d{0,6})\.\d{2}$/.test(amount) || Number(amount) <= 0) throw new Error('Enter a positive charge with two decimal places, such as 14.99.');
  if (!['GBP','USD','EUR','THB'].includes(currency)) throw new Error('Choose a supported currency.');
  if (!validDate(cancelled) || !validDate(charged)) throw new Error('Enter valid cancellation and charge dates.');
  let evidence;
  if (input.evidence !== undefined) {
    if (!Array.isArray(input.evidence) || input.evidence.length > 2) throw new Error('Provide up to two fictional evidence records.');
    evidence = input.evidence.map(e => {
      if (!e || !['E1','E2'].includes(e.id) || e.type !== (e.id === 'E1' ? 'cancellation' : 'receipt')) throw new Error('Invalid evidence record.');
      const facts = intakeFields({merchant:e.merchant,amount:e.type==='receipt'?e.amount:'1.00',currency:e.type==='receipt'?e.currency:'GBP',cancelled:e.date,charged:e.date,evidenceIds:[]});
      return e.type === 'cancellation'
        ? {id:e.id,type:e.type,merchant:facts.merchant,date:e.date,text:`Fictional confirmation: ${facts.merchant} subscription cancelled effective ${e.date}.`}
        : {id:e.id,type:e.type,merchant:facts.merchant,date:e.date,amount:facts.amount,currency:facts.currency,text:`Fictional receipt: ${facts.merchant} subscription charge of ${facts.currency} ${facts.amount} on ${e.date}.`};
    });
    if (new Set(evidence.map(e=>e.id)).size !== evidence.length) throw new Error('Duplicate evidence records.');
  } else {
    if (!Array.isArray(evidenceIds) || evidenceIds.some(id => !['E1','E2'].includes(id)) || new Set(evidenceIds).size !== evidenceIds.length) throw new Error('Choose evidence from the fictional library.');
    evidence = fictionalCase().evidence.filter(e => evidenceIds.includes(e.id));
  }
  return { merchant: merchant.trim(), amount, currency, cancelled, charged, evidence };
}
export function createCase(input) {
  if(isGeneral(input))return {id:randomUUID(),fictional:true,schemaVersion:2,caseType:'general',...generalFields(input),evidence:[],draft:null,accountOnlyConfirmed:false};
  return { ...fictionalCase(), ...intakeFields(input) };
}
export function checkEvidence(c) {
  if(isGeneral(c))return checkGeneralEvidence(c);
  const issues = [];
  const cancellation = c.evidence.find(e => e.type === 'cancellation');
  const receipt = c.evidence.find(e => e.type === 'receipt');
  if (!cancellation) issues.push('Cancellation confirmation is missing.');
  if (!receipt) issues.push('Billing receipt is missing.');
  const comparisons = [];
  const compare = (label, claimed, recorded, source) => {
    const match = claimed === recorded;
    comparisons.push({label,claimed,recorded,source,match});
    if (!match) issues.push(`${label} conflict: case says ${claimed}; ${source} says ${recorded}.`);
  };
  for (const e of c.evidence) compare('Merchant',c.merchant,e.merchant || 'StreamNest',e.id);
  if (!validDate(c.cancelled) || !validDate(c.charged)) issues.push('Case dates are invalid.');
  if (cancellation) compare('Cancellation date',c.cancelled,cancellation.date,cancellation.id);
  if (receipt) {
    compare('Charge date',c.charged,receipt.date,receipt.id);
    compare('Charge amount',c.amount,receipt.amount,receipt.id);
    compare('Currency',c.currency,receipt.currency,receipt.id);
  }
  if (validDate(c.cancelled) && validDate(c.charged) && c.charged <= c.cancelled) issues.push('The charge is not after the cancellation date.');
  return { ready: issues.length === 0, issues, comparisons, sources: c.evidence.map(e => e.id), limitation: 'Checks compare structured records, including human-reviewed pasted evidence; they do not authenticate documents or establish refund entitlement.' };
}
export function draftComplaint(c) {
  if(isGeneral(c))return draftGeneralComplaint(c);
  const checks = checkEvidence(c);
  if (!checks.ready) throw new Error('Resolve evidence issues before generating a draft: ' + checks.issues.join(' '));
  if (c.researchNeedsReview) throw new Error('The merchant changed. Review and save policy research for the current merchant before generating a fresh draft.');
  const cancellation = c.evidence.find(e => e.type === 'cancellation');
  const receipt = c.evidence.find(e => e.type === 'receipt');
  const research=c.research?.at(-1);
  const policy=research?'\n\nPlease explain how the following published passages apply to this charge:\n'+research.passages.map((passage,i)=>`[P${i+1}] "${passage.text}"${passage.truncated?' (excerpt truncated)':''}\nSource: ${research.url} (retrieved ${research.retrievedAt}).`).join('\n\n'):'';
  return `Subject: Request to review subscription charge\n\nHello ${c.merchant},\n\nMy cancellation confirmation records cancellation effective ${c.cancelled} [${cancellation.id}]. A billing receipt records a subsequent ${c.currency} ${c.amount} charge on ${c.charged} [${receipt.id}].${policy}\n\nPlease review this charge and refund it if it was taken in error. Please explain any basis for retaining the charge.\n\nThank you.\n\nFictional demonstration — draft for human review. Nothing has been sent.`;
}
export class CaseStore {
  constructor(directory) { this.directory = directory; mkdirSync(directory, { recursive: true }); }
  path(id) { if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid case ID'); return join(this.directory, id + '.json'); }
  save(c) { const target = this.path(c.id); const tmp = target + '.tmp'; writeFileSync(tmp, JSON.stringify(c, null, 2)); renameSync(tmp, target); return c; }
  get(id) { return JSON.parse(readFileSync(this.path(id), 'utf8')); }
  list() {
    return readdirSync(this.directory).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).map(name => {
      const c = this.get(name.slice(0, -5));
      return { id: c.id,caseType:c.caseType||'legacy-cancellation',issue:c.issue||'',complaintType:c.complaintType||'',incidentDate:c.incidentDate||'', merchant: c.merchant, amount: c.amount, currency: c.currency, charged: c.charged, hasDraft: c.draft !== null, revision: c.revision || 0, updatedAt: c.updatedAt || null, ...caseProgress(c) };
    }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id));
  }
  updateDetails(id, input, expectedRevision) {
    const c = this.get(id);
    if(isGeneral(c)&&c.resolution)throw Error('This case is resolved. Start a new case for a new complaint.');
    const fields = isGeneral(c)?{...generalFields(input),evidence:c.evidence}:intakeFields(input);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== (c.revision || 0)) throw new Error('This case has changed. Reopen it before saving; copy your edits first.');
    const changed = [...(isGeneral(c)?generalFieldNames:['merchant','amount','currency','cancelled','charged']),'evidence'].some(key => JSON.stringify(c[key]) !== JSON.stringify(fields[key]));
    if (!changed) return c;
    c.caseHistory ||= [];
    c.caseHistory.push({...(isGeneral(c)?generalFields(c):{}), merchant:c.merchant, amount:c.amount, currency:c.currency, cancelled:c.cancelled, charged:c.charged, evidence:c.evidence, revision:c.revision||0 });
    // Preserve provenance only when that record's structured facts are unchanged.
    if(!isGeneral(c))fields.evidence = fields.evidence.map(e => {
      const previous = c.evidence.find(old => old.id === e.id);
      const keys = ['id','type','merchant','date', ...(e.type === 'receipt' ? ['amount','currency'] : [])];
      return previous?.sourceId && keys.every(key => previous[key] === e[key]) ? previous : e;
    });
    if(fields.merchant!==c.merchant&&c.research?.length)c.researchNeedsReview=true;
    Object.assign(c, fields);
    if(isGeneral(c))c.accountOnlyConfirmed=false;
    c.revision = (c.revision || 0) + 1;
    c.updatedAt = new Date().toISOString();
    if (c.draft !== null) c.draftNeedsReview = true;
    event(c,'case-updated','Case claims or structured evidence updated.');
    return this.save(c);
  }
  saveReviewedEvidence(id, input, expectedRevision, documentFile = null) {
    const c = this.get(id);
    if(isGeneral(c)&&c.resolution)throw Error('This case is resolved. Start a new case for a new complaint.');
    if (!Number.isInteger(expectedRevision) || expectedRevision !== (c.revision || 0)) throw new Error('This case has changed. Reopen it before saving; copy your edits first.');
    const { source, record } = reviewedEvidence(isGeneral(c)?{...input,general:true}:input);
    if ((c.documents?.length || 0) >= 50) throw new Error('This demo case has reached its 50-source limit. Create a new fictional case.');
    if (documentFile) {
      if ((c.documents||[]).reduce((sum,doc)=>sum+(doc.file?.bytes||0),0)+documentFile.bytes>20*1024*1024) throw new Error('This case has reached its 20 MB document limit.');
      source.file = documentFile;
    }
    // Reuse the existing strict validation without replacing source text with fixture text.
    if(isGeneral(c)){
      validateGeneralEvidence(record);
      record.id='G'+((c.evidence||[]).reduce((n,e)=>Math.max(n,Number(e.id.replace(/^G/,''))||0),0)+1);
      record.active=true;
    }else intakeFields({ merchant: c.merchant, amount: c.amount, currency: c.currency, cancelled: c.cancelled, charged: c.charged, evidence: [record] });
    record.merchant = record.merchant.trim();
    c.caseHistory ||= [];
    c.caseHistory.push({ merchant:c.merchant, amount:c.amount, currency:c.currency, cancelled:c.cancelled, charged:c.charged, evidence:c.evidence, revision:c.revision||0, changedAt:source.addedAt });
    c.evidence = [...c.evidence.filter(e => e.id !== record.id), record].sort((a,b) => isGeneral(c)?Number(a.id.slice(1))-Number(b.id.slice(1)):a.id.localeCompare(b.id));
    c.documents ||= [];
    c.documents.push(source);
    c.revision = (c.revision || 0) + 1;
    c.updatedAt = source.addedAt;
    if (c.draft !== null) c.draftNeedsReview = true;
    event(c,'evidence-reviewed','Reviewed evidence saved: '+source.title,source.addedAt);
    return this.save(c);
  }
  saveDraft(id, text, expectedRevision, generated = false, kind = 'complaint', accountOnlyConfirmed = false) {
    if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw new Error('Enter a draft between 1 and 20,000 characters.');
    const c = this.get(id);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== (c.revision || 0)) throw new Error('This case has changed. Reopen it before saving; copy your edits first.');
    if(draftDisposition(c).historical)throw Error('This historical draft cannot be changed. Start a new case for a new complaint.');
    if(generated&&isGeneral(c)&&accountOnlyConfirmed===true)c.accountOnlyConfirmed=true;
    const revision = (c.revision || 0) + 1;
    const savedAt = new Date().toISOString();
    c.draftHistory ||= [];
    if (c.draft !== null && !c.draftHistory.length) c.draftHistory.push({ revision: c.revision || 0, text: c.draft, savedAt: c.updatedAt || null });
    c.draftHistory.push({ revision, text, savedAt });
    c.draftKind = generated ? kind : draftDisposition(c).kind;
    c.draft = text; c.revision = revision; c.updatedAt = savedAt;
    if (generated) c.draftNeedsReview = false;
    event(c,generated?'draft-prepared':'draft-edited',generated?isGeneral(c)?c.evidence.some(e=>e.active!==false)?'Complaint prepared from reviewed sources; source authenticity and narrative claims are not independently verified.':'Complaint prepared from the reviewed consumer account only; no independent records supplied.':'Evidence-backed draft prepared.':'Human-edited draft saved.',savedAt);
    return this.save(c);
  }
  setEvidenceStatus(id,input){
    const c=this.get(id);
    if(!isGeneral(c))throw Error('Evidence status changes apply to general complaints only.');
    if(c.resolution)throw Error('This case is resolved.');
    if(input?.revision!==(c.revision||0))throw Error('This case changed. Reopen it before changing evidence.');
    if(input.confirmed!==true||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)throw Error('Confirm the evidence change and give a reason.');
    const record=c.evidence.find(e=>e.id===input.evidenceId);if(!record||typeof input.active!=='boolean')throw Error('Choose an existing evidence record and its status.');
    c.caseHistory||=[];c.caseHistory.push({evidence:structuredClone(c.evidence),revision:c.revision||0});
    record.active=input.active;record.statusReason=input.reason.trim();record.statusAt=new Date().toISOString();
    c.revision=(c.revision||0)+1;c.updatedAt=record.statusAt;c.accountOnlyConfirmed=false;if(c.draft!==null)c.draftNeedsReview=true;
    event(c,'evidence-status',record.id+(input.active?' included':' excluded')+' from current checks: '+record.statusReason);
    return this.save(c);
  }
  saveResearch(id, research, expectedRevision) {
    const c=this.get(id);
    if(!Number.isInteger(expectedRevision)||expectedRevision!==(c.revision||0))throw new Error('This case has changed. Reopen it before saving policy research.');
    if(!research||research.caseId!==id||research.revision!==expectedRevision||!research.reviewedAt||!Array.isArray(research.passages)||!research.passages.length)throw new Error('Review the policy passages before saving.');
    c.research ||= [];if(c.research.length>=10)throw new Error('This demo case has reached its ten-research-snapshot limit.');
    c.research.push({...research,merchant:c.merchant});c.researchNeedsReview=false;
    c.revision=(c.revision||0)+1;c.updatedAt=new Date().toISOString();if(c.draft!==null)c.draftNeedsReview=true;
    event(c,'policy-reviewed','Reviewed merchant policy saved: '+research.url);
    return this.save(c);
  }
  communicationChange(id,input,expectedRevision,action){
    const c=this.get(id);if(!Number.isInteger(expectedRevision)||expectedRevision!==(c.revision||0))throw new Error('This case has changed. Reopen it before recording correspondence.');
    if(c.resolution&&action!=='resolve')throw new Error('This case is marked resolved. Start a new case for a new dispute.');
    let label;
    if(action==='approve'){
      if(!checkEvidence(c).ready)throw new Error('Resolve the evidence issues before approving a complaint.');
      const message=reviewedCorrespondence(c,input);c.communications ||= [];c.communications.push(message);label='Email approved for export to '+message.recipient+'. Nothing sent.';
    }else if(action==='export-request'){emailExport(c,input?.messageId);const message=c.communications.find(m=>m.id===input.messageId);message.exportRequestedAt=new Date().toISOString();label='Email file export requested. Download and actual sending are not confirmed.';}else if(action==='sent'){const message=recordSent(c,input);label='User recorded message as sent on '+message.sentDate+'; follow-up review '+message.followUpDate+'.';}
    else if(action==='response'){const response=recordResponse(c,input);label='Merchant response recorded for '+response.receivedDate+'.';}
    else if(action==='resolve'){
      if(input?.confirmed!==true||typeof input.note!=='string'||!input.note.trim()||input.note.length>2000)throw new Error('Describe the outcome and confirm that this case is resolved.');
      c.resolution={note:input.note.trim(),recordedAt:new Date().toISOString()};label='Case marked resolved: '+c.resolution.note;
    }else throw new Error('Unsupported correspondence action.');
    c.revision=(c.revision||0)+1;c.updatedAt=new Date().toISOString();c.caseStatus=caseProgress(c).status;event(c,action,label);return this.save(c);
  }
  prepareFollowUp(id,expectedRevision,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date())){
    const c=this.get(id);if(!Number.isInteger(expectedRevision)||expectedRevision!==(c.revision||0))throw new Error('This case has changed. Reopen it before preparing a follow-up.');
    if(!checkEvidence(c).ready||c.draftNeedsReview||c.researchNeedsReview)throw new Error('Review the current evidence and complaint before preparing a follow-up.');
    if(c.draftKind==='follow-up'&&!(c.communications||[]).some(m=>m.sentDate&&m.draftText===c.draft))throw Error('Your follow-up draft is already prepared. Review and approve it before preparing another.');
    return this.saveDraft(id,followUpDraft(c,today),expectedRevision,true,'follow-up');
  }
}
