import {randomUUID,createHash}from'node:crypto';
import {isGeneral} from './complaint-model.js';
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function draftDisposition(c){
 const kind=c.draftKind||(/^Subject:\s*Follow-up\b/i.test(c.draft||'')?'follow-up':'complaint');
 const sent=(c.communications||[]).filter(message=>message.sentDate).at(-1);
 const response=Boolean(sent&&(c.communications||[]).some(message=>message.kind==='response'&&(message.replyTo===sent.id||(message.unsolicited&&message.recordedAt>=(sent.sentRecordedAt||sent.approvedAt||'')))));
 const reason=c.resolution?'This case is resolved. The saved draft is retained as history and cannot be approved or exported.':kind==='follow-up'&&response?'A merchant response has been recorded. This unanswered follow-up is retained as history and cannot be approved or exported.':'';
 return {kind,historical:Boolean(reason),reason};
}
export function reviewedCorrespondence(c,input){
 if(input?.approved!==true)throw Error('Review the full recipient, subject and message, then explicitly approve the export.');
 if(!c.draft||c.draftNeedsReview||c.researchNeedsReview)throw Error('Generate and review a current evidence-backed draft before approval.');
 const disposition=draftDisposition(c);if(disposition.historical)throw Error(disposition.reason);
 if(typeof input.recipient!=='string'||input.recipient.length>254||! /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(input.recipient))throw Error('Enter one valid recipient email address from a verified complaint channel.');
 if(typeof input.subject!=='string'||!input.subject.trim()||input.subject.length>200||/[\r\n\x00-\x1f]/.test(input.subject))throw Error('Enter a subject of 1–200 characters on one line.');
 if(!['complaint','follow-up'].includes(input.kind))throw Error('Choose complaint or follow-up.');
 if(input.kind!==disposition.kind)throw Error('The message type must match the saved draft. Reopen the case before approving.');
 if(input.kind==='follow-up'&&!c.communications?.some(m=>m.sentDate))throw Error('Record the original complaint as actually sent before approving a follow-up.');
 return {id:randomUUID(),kind:input.kind,recipient:input.recipient,subject:input.subject.trim(),body:c.draft.replace(/^Subject:[^\r\n]*\r?\n(?:\r?\n)?/i,''),draftText:c.draft,draftRevision:c.revision||0,draftHash:createHash('sha256').update(c.draft).digest('hex'),facts:{caseType:c.caseType||'legacy-cancellation',issue:c.issue||'',desiredOutcome:c.desiredOutcome||'',merchant:c.merchant,amount:c.amount,currency:c.currency,charged:c.charged,cancelled:c.cancelled},approvedAt:new Date().toISOString(),sentDate:null,followUpDate:null};
}
export function emailExport(c,id){
 const disposition=draftDisposition(c);if(disposition.historical)throw Error(disposition.reason);
 const message=c.communications?.find(m=>m.id===id&&m.approvedAt);if(!message)throw Error('Choose an approved message to export.');
 if(message.draftText!==c.draft||c.draftNeedsReview||c.researchNeedsReview)throw Error('The approved message is no longer current. Review and approve the latest draft before exporting.');
 const encodedSubject='=?UTF-8?B?'+Buffer.from(message.subject).toString('base64')+'?=';
 const body=Buffer.from(message.body).toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
 return ['To: '+message.recipient,'Subject: '+encodedSubject,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','X-Unsent: 1','',body,''].join('\r\n');
}
export function recordSent(c,input){
 const message=c.communications?.find(m=>m.id===input?.messageId&&m.approvedAt);if(!message)throw Error('Choose an approved message first.');
 if(input.confirmed!==true)throw Error('Confirm that you actually sent this message outside SIR. Downloading an email does not send it.');
 if(message.sentDate)throw Error('This message is already recorded as sent.');
 if(draftDisposition(c).historical)throw Error(draftDisposition(c).reason);
 if(message.draftText!==c.draft||c.draftNeedsReview||c.researchNeedsReview)throw Error('This approved message became outdated. Review and approve the current draft before recording a send.');
 if(!validDate(input.sentDate)||!validDate(input.followUpDate)||input.followUpDate<=input.sentDate)throw Error('Enter valid sent and follow-up dates, with follow-up after the sent date.');
 message.sentDate=input.sentDate;message.followUpDate=input.followUpDate;message.sentRecordedAt=new Date().toISOString();return message;
}
export function recordResponse(c,input){
 const unsolicited=input?.unsolicited===true;
 const prior=c.communications?.find(m=>m.id===input?.messageId&&m.sentDate);
 if(!unsolicited&&!prior)throw Error('Record the original message as actually sent first, or explicitly choose an unsolicited merchant communication. Downloading an email does not send it.');
 if(unsolicited&&input.messageId)throw Error('An unsolicited communication must not claim to reply to an outgoing message.');
 if(!validDate(input.receivedDate)||(!unsolicited&&input.receivedDate<prior.sentDate))throw Error('Enter a valid response date on or after the sent date, where applicable.');
 if(typeof input.text!=='string'||!input.text.trim()||input.text.length>30000)throw Error('Paste a fictional or anonymised response of 1–30,000 characters.');
 const response={id:randomUUID(),kind:'response',replyTo:unsolicited?null:prior.id,unsolicited,receivedDate:input.receivedDate,body:input.text,recordedAt:new Date().toISOString()};c.communications ||= [];c.communications.push(response);return response;
}
export function caseProgress(c,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date())){
 if(c.resolution)return {status:'resolved',nextAction:'Case resolved: '+c.resolution.note,followUpDate:null};
 const sent=(c.communications||[]).filter(m=>m.sentDate).at(-1);
 if(sent){const response=(c.communications||[]).find(m=>m.kind==='response'&&(m.replyTo===sent.id||(m.unsolicited&&m.recordedAt>=(sent.sentRecordedAt||sent.approvedAt||''))));if(response)return {status:'response-received',nextAction:'Review the recorded merchant response before deciding the next step.',followUpDate:null};return {status:'awaiting-response',nextAction:sent.followUpDate<=today?'A response is outstanding. Review the case and prepare a follow-up if appropriate.':'Await the merchant’s response; review again on '+sent.followUpDate+'.',followUpDate:sent.followUpDate};}
 if((c.communications||[]).some(m=>m.kind==='response'))return {status:'response-received',nextAction:'Review the unsolicited merchant communication and decide whether it resolves this case.',followUpDate:null};
 if(c.draft&&(c.draftNeedsReview||c.researchNeedsReview))return {status:'draft-needs-review',nextAction:'Case facts or sources changed. Check the evidence and generate a fresh draft before approving export.',followUpDate:null};
 if(c.communications?.some(m=>m.approvedAt&&m.draftText===c.draft))return {status:'prepared',nextAction:'A reviewed email is ready to export. Nothing is recorded as sent.',followUpDate:null};
 return {status:c.draft?'draft-ready':'collecting-evidence',nextAction:c.draft?'Review the complaint, choose the recipient and approve an email export.':isGeneral(c)?'Review supporting records, or explicitly choose an account-only draft.':'Add independent cancellation and billing evidence before drafting.',followUpDate:null};
}
export function followUpDraft(c,today){
 const progress=caseProgress(c,today);if(progress.status!=='awaiting-response'||progress.followUpDate>today)throw Error('A follow-up is available only when a sent message is awaiting a response and its review date has arrived.');
 const prior=c.communications.filter(m=>m.sentDate).at(-1);const f=prior.facts;
 if(isGeneral(c))return `Subject: Follow-up on complaint to ${f.merchant}\n\nHello ${f.merchant},\n\nI wrote on ${prior.sentDate} about the complaint described in my earlier message. I have not yet recorded a response.\n\nMy requested outcome remains: ${f.desiredOutcome||c.desiredOutcome}\n\nPlease acknowledge the complaint and explain the next steps and expected response time.\n\nOriginal subject: ${prior.subject}\nCase reference: ${c.id}\n\nThank you.\n\nFictional demonstration — draft for human review. Nothing has been sent.`;
 return `Subject: Follow-up on subscription charge complaint\n\nHello ${f.merchant},\n\nI wrote on ${prior.sentDate} about a ${f.currency} ${f.amount} subscription charge dated ${f.charged}. I have not yet recorded a response to that message.\n\nPlease acknowledge my complaint and let me know when I can expect your explanation and proposed resolution.\n\nOriginal subject: ${prior.subject}\nCase reference: ${c.id}\n\nThank you.\n\nFictional demonstration — draft for human review. Nothing has been sent.`;
}
