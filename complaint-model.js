// General consumer complaint model. Shared labels and validation are browser-safe.
export const generalLabels={merchant:'Company or organisation',issue:'What happened',desiredOutcome:'Outcome requested',complaintType:'Complaint category',expected:'What was promised or expected',actual:'What actually happened / impact',priorContact:'Previous contact and response',incidentDate:'Relevant event date',reference:'Order or account reference',amount:'Amount involved',currency:'Currency (three-letter code)',charged:'Payment or charge date',cancelled:'Cancellation date (if relevant)'};
export const generalFieldNames=Object.keys(generalLabels);
export const generalRequired=['merchant','issue','desiredOutcome'];
export const complaintCategories=['billing','cancellation','non-delivery','faulty-product','poor-service','booking','other'];
export const isGeneral=c=>c?.caseType==='general'||c?.schemaVersion===2;
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function validateGeneralField(key,value){
  if(!generalFieldNames.includes(key)||typeof value!=='string')throw Error('Unsupported complaint field.');
  const clean=value.trim();
  const limit=key==='issue'?4000:['desiredOutcome','expected','actual','priorContact'].includes(key)?1500:200;
  if(clean.length>limit)throw Error(generalLabels[key]+' is too long (maximum '+limit+' characters).');
  if(!clean)return '';
  if(['incidentDate','charged','cancelled'].includes(key)&&!validDate(clean))throw Error('Enter '+generalLabels[key]+' as a valid YYYY-MM-DD date, or leave it unknown.');
  if(key==='amount'&&!/^(0|[1-9]\d{0,8})(?:\.\d{2})$/.test(clean))throw Error('Use a non-negative amount with two decimal places, or leave it unknown.');
  if(key==='currency'&&!/^[A-Z]{3}$/.test(clean.toUpperCase()))throw Error('Use a three-letter currency code or leave it unknown.');
  if(key==='complaintType'&&!complaintCategories.includes(clean))throw Error('Choose a recognised complaint category or other.');
  return key==='currency'?clean.toUpperCase():clean;
}
export function generalFields(input,{requireComplete=true}={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Complaint facts are required.');
  const fields=Object.fromEntries(generalFieldNames.map(key=>[key,validateGeneralField(key,input[key]??'')]));
  if(requireComplete){const missing=generalRequired.filter(key=>!fields[key]);if(missing.length)throw Error('Still needed: '+missing.map(key=>generalLabels[key]).join(', ')+'.');}
  return fields;
}
export function generalSummary(session){
  const facts=session.facts||{},missing=generalRequired.filter(key=>!facts[key]).map(key=>generalLabels[key]);
  const issues=[];for(const key of generalFieldNames){try{validateGeneralField(key,facts[key]??'');}catch(error){issues.push(error.message);}}
  const warnings=[];
  if(facts.amount&&!facts.currency)warnings.push('The amount has no currency yet. The draft will label it unspecified; clarify it when possible.');
  if(facts.charged&&facts.cancelled&&facts.charged===facts.cancelled)warnings.push('Charge and cancellation share a date. Their order is unknown unless supporting records establish it. This does not block case creation.');
  return {missing,issues,warnings,blockerCode:null,ready:!missing.length&&!issues.length,
    lines:generalFieldNames.map(key=>generalLabels[key]+': '+(facts[key]||'Not supplied / not applicable')),
    nextAction:issues.length?issues.join(' '):missing.length?'Still needed: '+missing.join(', ')+'.':'Review the facts, make any corrections, tick the confirmation and create the case. Then review supporting records or explicitly choose an account-only draft.'};
}
export const sourceTypes=['supporting','correspondence','order','statement','cancellation','receipt'];
export function validateGeneralEvidence(record){
  if(!record||!sourceTypes.includes(record.type)||typeof record.text!=='string'||!record.text.trim())throw Error('A reviewed source needs a type and source text.');
  for(const key of ['merchant','date','amount','currency']){
    if(typeof record[key]!=='string')throw Error('Reviewed evidence facts must be text; unknown values should be blank.');
    if(record[key])validateGeneralField(key==='date'?'incidentDate':key,record[key]);
  }
  if(!['none','charged','cancelled','incidentDate'].includes(record.dateRole||'none'))throw Error('Choose which case date this evidence should be compared with.');
  if(record.reference!==undefined)validateGeneralField('reference',record.reference);
  return record;
}
export function checkGeneralEvidence(c){
  const issues=[],warnings=[],comparisons=[],active=c.evidence.filter(e=>e.active!==false);
  try{generalFields(c);}catch(error){issues.push(error.message);}
  if(!active.length&&!c.accountOnlyConfirmed)issues.push('Add a reviewed supporting record, or explicitly choose to draft from your account without documentary evidence.');
  const compare=(label,claimed,recorded,source)=>{const match=label==='Company'?claimed.toLocaleLowerCase('en-GB')===recorded.toLocaleLowerCase('en-GB'):claimed===recorded;comparisons.push({label,claimed,recorded,source,match});if(!match)issues.push(label+' conflict: case says '+claimed+'; '+source+' says '+recorded+'.');};
  for(const record of active){
    try{validateGeneralEvidence(record);}catch(error){issues.push(record.id+': '+error.message);continue;}
    if(record.type==='statement'){warnings.push(record.id+' is a consumer statement, not independent corroboration.');continue;}
    if(record.compareToCase===false)continue;
    if(record.merchant&&c.merchant)compare('Company',c.merchant,record.merchant,record.id);
    if(record.reference&&c.reference)compare('Order or account reference',c.reference,record.reference,record.id);
    if(record.type==='receipt'){
      if(record.amount&&c.amount)compare('Amount',c.amount,record.amount,record.id);
      if(record.currency&&c.currency)compare('Currency',c.currency,record.currency,record.id);
    }
    const role=record.dateRole||'none';
    if(role!=='none'&&record.date&&c[role])compare(generalLabels[role],c[role],record.date,record.id);
  }
  if(c.charged&&c.cancelled&&c.charged===c.cancelled)warnings.push('Same-day events: the dates alone do not establish which event happened first.');
  if(!active.length&&c.accountOnlyConfirmed)warnings.push('Account-only draft: statements are your account and are not independently corroborated.');
  if(c.amount&&!c.currency)warnings.push('Currency remains unspecified; no currency will be invented.');
  return {ready:!issues.length,issues,warnings,comparisons,sources:active.map(e=>e.id),limitation:'Checks compare reviewed structured facts only. They do not authenticate records, verify narrative claims or establish entitlement.'};
}
export function draftGeneralComplaint(c){
  const checks=checkGeneralEvidence(c);if(!checks.ready)throw Error('Resolve the review issues before drafting: '+checks.issues.join(' '));
  if(c.researchNeedsReview)throw Error('Review policy research for the current company before generating a fresh draft.');
  const sources=c.evidence.filter(e=>e.active!==false).slice(-10);
  let text='Subject: Complaint to '+c.merchant.replace(/[\r\n]/g,' ')+'\n\nHello '+c.merchant+',\n\nI am asking you to investigate the following complaint.\n\nMy account of what happened:\n'+c.issue;
  for(const [key,label] of [['expected','What I expected'],['actual','What happened / impact'],['priorContact','Previous contact'],['reference','Reference'],['incidentDate','Relevant event date'],['charged','Payment or charge date'],['cancelled','Cancellation date, where relevant']])if(c[key])text+='\n\n'+label+': '+c[key];
  if(c.amount)text+='\n\nAmount involved: '+(c.currency?c.currency+' ':'[currency not supplied] ')+c.amount+'.';
  if(c.charged&&c.charged===c.cancelled)text+='\nThe charge and cancellation dates are the same; I am not asserting their order based on those dates alone. Please clarify your records.';
  text+='\n\nOutcome I am requesting:\n'+c.desiredOutcome+'\nPlease explain your findings and whether you can provide this outcome.';
  if(sources.length){text+='\n\nSupporting records supplied for your review:';for(const e of sources)text+='\n['+e.id+'] '+(e.type==='statement'?'Consumer statement — not independent evidence':e.type)+'; '+((c.documents||[]).find(d=>d.id===e.sourceId)?.title||'Reviewed record')+'; '+[e.reference?'reference '+e.reference:'',e.amount?(e.currency||'unspecified currency')+' '+e.amount:'',e.date?'dated '+e.date:''].filter(Boolean).join('; ')+' — original retained in the case';if(c.evidence.filter(e=>e.active!==false).length>10)text+='\nAdditional sources are retained in the case record.';}
  else text+='\n\nThis complaint is based on my account only. No supporting documents have been supplied. Please investigate your own records; these statements are not presented as independently corroborated.';
  const policy=c.research?.at(-1);if(policy){text+='\n\nPlease explain the relevance of these reviewed published passages:';for(const [i,p]of policy.passages.entries())text+='\n[P'+(i+1)+'] '+p.text.slice(0,900)+'\nSource: '+policy.url+' (retrieved '+policy.retrievedAt+').';}
  return text+'\n\nThank you.\n\nFictional demonstration — draft for human review. Nothing has been sent. No legal entitlement is asserted by SIR.';
}
