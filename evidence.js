import { randomUUID } from 'node:crypto';
import {sourceTypes,validateGeneralEvidence,validateGeneralField} from './complaint-model.js';

// Deliberately conservative: source text is data, never agent instructions.
export function previewEvidence(input) {
  if (!input || !sourceTypes.includes(input.type)) throw new Error('Choose a supported evidence type.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 30000) throw new Error('Paste between 1 and 30,000 characters of fictional or anonymised evidence.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160) throw new Error('Give the source a title of 1–160 characters.');
  const candidates = {};
  const extract = (key, pattern, transform = value => value.trim()) => {
    const matches = [...input.text.matchAll(pattern)];
    const values = [...new Set(matches.map(match => transform(match[1])))];
    candidates[key] = { value: values.length === 1 ? values[0] : '', quotes: matches.map(match => match[0].trim()), ambiguous: values.length > 1 };
  };
  extract('merchant', /^(?:merchant(?: name)?|company(?: name)?|retailer|seller|sold by|supplier)\s*:\s*(.+)$/gim);
  // Only an unmistakable business-style first heading is a fallback. Never infer
  // a merchant from arbitrary prose, or override conflicting labelled companies.
  if (!candidates.merchant.quotes.length) {
    const headings=input.text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).filter(line=>!/^\[?page \d+\]?$/i.test(line)).slice(0,3).map(line=>line.replace(/\s+[-–—|]\s+(?:order confirmation|purchase confirmation|receipt|invoice)\s*$/i,'')).filter(line=>!/^(?:fictional(?: test)?(?: document)?|order confirmation|purchase confirmation|receipt|invoice)$/i.test(line));
    const businessHeadings=headings.filter(line=>/(?:Ltd\.?|Limited|LLC|Inc\.?|Supplies|Services|Store|Shop)$/i.test(line));
    const heading=businessHeadings.length===1?businessHeadings[0]:'';
    const businessStyle=heading.split(/\s+/).every(word=>/^(?:[\p{Lu}\d&][\p{L}\d&'’.,()-]*|and|of|the)$/u.test(word));
    const labelledRecord=/^(?:order reference|order number|reference|amount|amount paid|total)\s*:/im.test(input.text);
    if(heading.length<=100 && businessStyle && labelledRecord && /^[\p{L}\d &'’.,()-]+(?:Ltd\.?|Limited|LLC|Inc\.?|Supplies|Services|Store|Shop)$/iu.test(heading))
      candidates.merchant={value:heading,quotes:[heading],ambiguous:false};
  }
  extract('date', input.type === 'cancellation'
    ? /^(?:cancellation effective date|cancellation date|cancelled effective|canceled effective)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/gim
    : /^(?:date|incident date|order date|payment date|delivery date|charge date|transaction date|billing date)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/gim);
  {
    extract('amount', /^(?:amount|amount paid|payment amount|charge amount|total paid|total)\s*:\s*(?:[A-Z]{3}|[£€$])?\s*(\d+\.\d{2})\s*(?:[A-Z]{3})?\s*$/gim);
    extract('currency', /^(?:currency\s*:\s*|(?:amount|amount paid|payment amount|charge amount|total paid|total)\s*:\s*)([A-Z]{3})(?:\s+\d+\.\d{2})?\s*$/gim, value => value.toUpperCase());
    const trailing = [...input.text.matchAll(/^(?:amount|amount paid|payment amount|charge amount|total paid|total)\s*:\s*\d+\.\d{2}\s+([A-Z]{3})\s*$/gim)];
    if (trailing.length) {
      const previous = candidates.currency;
      const values = [...new Set([...previous.quotes.flatMap(q => q.match(/\b(?:[A-Z]{3})\b/gi) || []).map(v => v.toUpperCase()), ...trailing.map(m => m[1].toUpperCase())])];
      candidates.currency = { value: values.length === 1 ? values[0] : '', quotes: [...previous.quotes, ...trailing.map(m => m[0].trim())], ambiguous: values.length > 1 };
    }
  }
  extract('reference', /^(?:reference|reference number|confirmation number|order reference|order number|order no\.?|order #)\s*:\s*(.+)$/gim);
  const dateFields=[...input.text.matchAll(/^(date|incident date|order date|payment date|delivery date|charge date|transaction date|billing date|cancellation date|cancellation effective date)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/gim)].map(m=>({label:m[1].toLowerCase(),value:m[2],quote:m[0].trim()}));
  candidates.date.fields=dateFields;
  const role=label=>/^(payment|charge|transaction|billing) date$/.test(label)?'charged':/^cancellation/.test(label)?'cancelled':'none';
  const roles=[...new Set(dateFields.map(d=>role(d.label)))];
  candidates.date.role=roles.length===1?roles[0]:'none';
  if(new Set(dateFields.map(d=>d.label)).size>1){candidates.date.value='';candidates.date.ambiguous=true;candidates.date.role='none';}
  return { source: { title: input.title.trim(), text: input.text, type: input.type }, candidates,
    limitation: 'Pattern suggestions only. Missing or conflicting values require your review. No document authentication or AI extraction.' };
}

export function reviewedEvidence(input) {
  const preview = previewEvidence(input);
  if (input.confirmed !== true) throw new Error('Review the source and explicitly confirm the evidence facts first.');
  const source = { id: randomUUID(), ...preview.source, addedAt: new Date().toISOString(), extraction: preview.candidates };
  if(input.general===true){
    const facts=Object.fromEntries(['merchant','date','amount','currency','reference'].map(key=>[key,validateGeneralField(key==='date'?'incidentDate':key,input.facts?.[key]??'')]));
    const record={...facts,id:'pending',type:input.type,sourceId:source.id,text:input.text,reviewedAt:source.addedAt,compareToCase:input.compareToCase!==false,dateRole:input.dateRole||'none'};
    validateGeneralEvidence(record);source.corrections={};for(const [key,value]of Object.entries(facts)){if(value!==(preview.candidates[key]?.value||''))source.corrections[key]={suggested:preview.candidates[key]?.value||'',reviewed:value};}
    return {source,record};
  }
  const corrections = {};
  for (const key of ['merchant', 'date', ...(input.type === 'receipt' ? ['amount', 'currency'] : [])]) {
    if (typeof input.facts?.[key] !== 'string') throw new Error('Complete the reviewed evidence facts.');
    if (input.facts[key] !== preview.candidates[key].value) corrections[key] = { suggested: preview.candidates[key].value, reviewed: input.facts[key] };
  }
  source.corrections = corrections;
  return { source, record: { ...input.facts, id: input.type === 'cancellation' ? 'E1' : 'E2', type: input.type, sourceId: source.id, text: input.text, reviewedAt: source.addedAt } };
}
