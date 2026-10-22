import { CaseStore, createCase, intakeFields } from './core.js';
import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {isGeneral,generalFieldNames,generalLabels,generalFields,generalSummary,validateGeneralField} from './complaint-model.js';

const fieldNames = ['merchant', 'amount', 'currency', 'cancelled', 'charged'];
const labels = {merchant:'Merchant',amount:'Charge amount',currency:'Currency',cancelled:'Cancellation effective date',charged:'Charge date'};
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function validateField(field, value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('The AI returned an empty proposed fact. Please clarify it.');
  if (field === 'merchant' && value.length <= 100) return value.trim();
  if (field === 'amount' && /^(0|[1-9]\d{0,6})\.\d{2}$/.test(value) && Number(value)>0) return value;
  if (field === 'currency' && ['GBP','USD','EUR','THB'].includes(value)) return value;
  if (['cancelled','charged'].includes(field) && validDate(value)) return value;
  throw new Error('The AI proposed an invalid '+(labels[field]||'field')+'. Please clarify it.');
}
export function intakeSummary(session) {
  if(isGeneral(session))return generalSummary(session);
  const missing = fieldNames.filter(key => !session.facts[key]);
  const issues = [];
  let blockerCode=null;
  if (session.facts.cancelled && session.facts.charged && session.facts.charged <= session.facts.cancelled) {
    blockerCode=session.facts.charged===session.facts.cancelled?'same-day-charge':'charge-before-cancellation';
    issues.push(blockerCode==='same-day-charge'
      ? 'The charge and cancellation have the same date. Those dates may be correct, but this prototype only supports a charge on a later calendar date. It cannot establish the order of same-day events or handle a service-not-supplied complaint. Keep the true dates; do not change them just to enable the button.'
      : 'The charge date is before the cancellation effective date. Check for a transcription error. If both dates are correct, this complaint is outside the prototype’s charge-after-cancellation workflow; do not change correct dates to proceed.');
  }
  return { missing:missing.map(key=>labels[key]), issues, blockerCode, ready:missing.length===0&&issues.length===0, lines:fieldNames.map(key=>labels[key]+': '+(session.facts[key]||'Not yet supplied')),
    nextAction:issues.length?issues[0]:missing.length?'Still needed: '+missing.map(key=>labels[key]).join(', ')+'.':'Review the proposed case facts, tick the confirmation, then select Create case from reviewed facts. Supporting evidence is added separately.' };
}
export class IntakeStore extends CaseStore {
  create({version=2}={}) { const session={id:randomUUID(),schemaVersion:version,...(version===2?{caseType:'general'}:{}),revision:0,facts:{},messages:[],proposals:[],caseId:null,createdAt:new Date().toISOString()};return this.save(session); }
  get(id){
    const session=super.get(id);
    // Uncommitted old sessions become a general intake view; no write occurs on read.
    if(session.schemaVersion===undefined&&!session.caseId){
      session.schemaVersion=2;session.caseType='general';session.upgradedFrom='legacy-uncommitted';
      const first=session.messages?.find(m=>m.role==='user'&&m.text.trim().length>10);
      if(!session.facts.issue&&first)session.facts.issue=first.text.slice(0,4000);
    }
    return session;
  }
  list() { // Discovery uses the intake schema rather than the case schema.
    return readdirSync(this.directory).filter(name=>/^[0-9a-f-]{36}\.json$/.test(name)).map(name=>this.get(name.slice(0,-5))).map(s=>({id:s.id,revision:s.revision,merchant:s.facts.merchant||'New conversation',caseId:s.caseId,updatedAt:s.updatedAt||s.createdAt})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  assertCurrent(id, revision) { const session=this.get(id);if(!Number.isInteger(revision)||revision!==session.revision)throw new Error('This conversation has changed. Reopen it before continuing.');if(session.caseId)throw new Error('This conversation already created a case. Open that saved case to continue.');return session; }
  saveTurn(id, revision, message, output) {
    const session=this.assertCurrent(id,revision);
    const allowed=isGeneral(session)?generalFieldNames:fieldNames;
    if (!output || Object.keys(output).some(key=>!['reply','updates'].includes(key)) || typeof output.reply!=='string' || !output.reply.trim() || output.reply.length>6000 || !Array.isArray(output.updates) || output.updates.length>allowed.length) throw new Error('The AI returned an unsupported response. Nothing was changed.');
    const sourceMessages=[...session.messages.filter(m=>m.role==='user').map(m=>m.text),message];
    const seen=new Set();const updates=output.updates.map(update=>{
      if(!update||Object.keys(update).some(key=>!['field','value','quote'].includes(key))||!allowed.includes(update.field)||seen.has(update.field))throw new Error('The AI tried to change an unsupported or duplicate field. Nothing was changed.');
      if(typeof update.quote!=='string'||update.quote.trim().length<2||update.quote.length>6000||!sourceMessages.some(text=>text.includes(update.quote)))throw new Error('The AI proposed a fact without a matching quotation from your messages. Nothing was changed.');
      seen.add(update.field);return {...update,value:isGeneral(session)?validateGeneralField(update.field,update.value):validateField(update.field,update.value)};
    });
    for(const update of updates)session.facts[update.field]=update.value;
    const now=new Date().toISOString();
    const summary=intakeSummary(session);
    const workflowReply=isGeneral(session)
      ? summary.ready?'I have enough to get your complaint started. Please review the summary below, confirm the facts or edit any details, then create your case. We will review supporting records next.':summary.issues.length?summary.nextAction:output.reply
      :summary.issues.length
      ? 'I have recorded the dates you supplied. '+summary.nextAction+' Your conversation is saved, but Create case remains unavailable for this workflow. For a paid-but-not-supplied complaint, the product needs a separate non-delivery workflow; repeating the same facts will not unlock this one.'
      : null;
    session.messages.push({role:'user',text:message,at:now},{role:'assistant',text:workflowReply||output.reply,origin:workflowReply?'workflow':'ai',at:now});
    session.proposals.push({revision:revision+1,updates,at:now});session.revision++;session.updatedAt=now;
    return this.save(session);
  }
  reviewFacts(id,input){
    const session=this.assertCurrent(id,input?.revision);
    if(!isGeneral(session))throw Error('Direct fact review applies to general intake.');
    if(input.confirmed!==true)throw Error('Confirm the reviewed corrections.');
    if(!input.facts||Object.keys(input.facts).some(key=>!generalFieldNames.includes(key)))throw Error('Unsupported fact correction.');
    const facts=generalFields({...session.facts,...input.facts},{requireComplete:false});
    const updates=generalFieldNames.filter(key=>(session.facts[key]||'')!==facts[key]).map(field=>({field,value:facts[field],quote:facts[field],origin:'human-review'}));
    session.facts=facts;session.revision++;session.updatedAt=new Date().toISOString();
    session.proposals.push({revision:session.revision,updates,at:session.updatedAt,origin:'human-review'});
    return this.save(session);
  }
  commit(id, input, caseStore) {
    const session=this.get(id);
    if(!input||input.confirmed!==true)throw new Error('Review and explicitly confirm the proposed case facts.');
    if(!Number.isInteger(input.revision)||input.revision!==session.revision)throw new Error('This conversation has changed. Reopen it before confirming.');
    if(session.caseId)return caseStore.get(session.caseId);
    if(!intakeSummary(session).ready)throw new Error('Complete and clarify the conversation facts before creating a case.');
    const fields={...session.facts,...(isGeneral(session)?{schemaVersion:2,caseType:'general'}:{}),evidence:[]};
    if(isGeneral(session))generalFields(fields);else intakeFields(fields);
    let c;
    try{c=caseStore.get(session.id);}catch(error){if(error.code!=='ENOENT')throw error;c=createCase(fields);c.id=session.id;c.intakeId=session.id;c.conversation=session.messages;c.claimProvenance=session.proposals;c.updatedAt=new Date().toISOString();caseStore.save(c);}
    session.caseId=c.id;session.revision++;session.updatedAt=c.updatedAt;this.save(session);return c;
  }
}

export class ConversationService {
  constructor(store, provider) { this.store=store;this.provider=provider;this.inFlight=new Set(); }
  async turn(id,input) {
    if(!input||input.shareConfirmed!==true)throw new Error('Confirm that this fictional or anonymised conversation may be sent to the configured AI service.');
    if(typeof input.message!=='string'||!input.message.trim()||input.message.length>6000)throw new Error('Enter a message between 1 and 6,000 characters.');
    const session=this.store.assertCurrent(id,input.revision);
    if(session.messages.length>=40||session.messages.reduce((n,m)=>n+m.text.length,0)+input.message.length>40000)throw new Error('This demo conversation has reached its limit. Start a new conversation.');
    if(this.inFlight.has(id))throw new Error('A reply is already being prepared for this conversation.');
    this.inFlight.add(id);
    try{const result=await this.provider.respond({facts:session.facts,caseType:isGeneral(session)?'general':'legacy-cancellation',workflow:intakeSummary(session),messages:session.messages,message:input.message});return this.store.saveTurn(id,input.revision,input.message,result);}finally{this.inFlight.delete(id);}
  }
}
