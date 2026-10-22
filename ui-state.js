// Shared, deterministic form hydration. Never invent dates when reopening a case.
import {isGeneral,generalFieldNames} from './complaint-model.js';
export function caseFormValues(c) {
  const values = Object.fromEntries(['merchant','amount','currency','cancelled','charged'].map(key => [key, c[key] ?? '']));
  for (const [prefix,type] of [['e1','cancellation'],['e2','receipt']]) {
    const record = c.evidence.find(e => e.type === type);
    values[prefix] = Boolean(record);
    values[prefix+'-merchant'] = record ? record.merchant || 'StreamNest' : '';
    values[prefix+'-date'] = record?.date ?? '';
    if (prefix === 'e2') {
      values['e2-amount'] = record?.amount ?? '';
      values['e2-currency'] = record?.currency ?? '';
    }
  }
  if(isGeneral(c))for(const key of generalFieldNames)values[key]=c[key]??'';
  return values;
}

export function correspondenceDates(c, messageId) {
  const message = (c.communications || []).find(m => m.id === messageId);
  const response = (c.communications || []).filter(m => m.kind === 'response' && m.replyTo === messageId).at(-1);
  return {'sent-date': message?.sentDate ?? '', 'follow-up-date': message?.followUpDate ?? '', 'response-date': response?.receivedDate ?? ''};
}

export function restoreDates(c, messageId, pending) {
  return pending?.caseId === c.id && pending.messageId === messageId ? pending.values : correspondenceDates(c, messageId);
}

export function displayDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Not supplied';
  const date = new Date(value+'T12:00:00Z');
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0,10) !== value ? 'Not supplied' : new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
}

export function exportMatchesDraft(c, messageId) {
  const message=c?.communications?.find(item=>item.id===messageId);
  return Boolean(message?.approvedAt && c.draft && message.draftText===c.draft && !c.draftNeedsReview && !c.researchNeedsReview && !c.resolution);
}

export function intakeReadiness(session,confirmed=false) {
  if(!session)return {canCreate:false,title:'Start a conversation',reason:'Describe what happened to begin.'};
  if(session.caseId)return {canCreate:false,title:'Case already created',reason:'Open the saved case to continue with evidence and drafting.'};
  const facts=session.facts||{};
  if(!isGeneral(session)&&facts.cancelled&&facts.charged&&facts.charged<=facts.cancelled){
    return {canCreate:false,title:'This workflow does not cover these dates',reason:facts.charged===facts.cancelled
      ? 'Case creation is unavailable because the charge and cancellation are on the same date. Your dates may be correct: this prototype only handles charges on a later calendar date. Same-day disputes and a service not being supplied need a different workflow. Keep the true dates; repeating or reconfirming them will not unlock this button.'
      : 'The charge is dated before cancellation. Correct a date only if it was entered wrongly. If both dates are right, this complaint needs a different workflow.'};
  }
  if(!session.summary.ready)return {canCreate:false,title:'More information needed',reason:session.summary.issues?.length?session.summary.issues.join(' '):'Still needed: '+(session.summary.missing||[]).join(', ')+'.'};
  return {canCreate:confirmed,title:'Review your case facts',reason:confirmed?'Ready to create this case. Add supporting evidence afterwards.':'Please confirm the facts before creating your case.'};
}

export function compactIntakeFacts(session) {
  const facts=session?.facts||{};
  const fields=isGeneral(session)?['merchant','issue','desiredOutcome','reference','amount','currency','charged','cancelled','incidentDate','expected','actual','priorContact']:['merchant','amount','currency','cancelled','charged'];
  return fields.filter(key=>facts[key]).map(key=>({key,value:facts[key]}));
}

export function exportGuidance(c,{draftDirty=false,caseDirty=false,approved=false,confirmed=false,recipient='',subject='',historical=''}={}) {
  if(!c)return 'Create or open a case, then prepare your complaint.';
  if(historical)return historical;
  if(caseDirty)return 'Save your case details, then prepare and review a fresh complaint draft.';
  if(draftDirty)return 'Save your complaint draft before approving export.';
  if(c.draftNeedsReview||c.researchNeedsReview)return 'Your supporting evidence or case facts have changed. Generate and review a fresh draft before exporting.';
  if(!c.draft)return 'Prepare your complaint draft, then review its wording. The prepared draft is saved automatically.';
  if(approved)return 'Your reviewed email is approved. Download the unsent .eml draft below. SIR does not send it.';
  if(!recipient.trim()||!subject.trim())return 'Enter the recipient and subject, then review the complete email preview.';
  if(!confirmed)return 'Review the recipient, subject and complete message, then tick the approval confirmation.';
  return 'Select Approve email export, then download the approved unsent draft.';
}

// Derived from saved facts and correspondence. Pending form state can only add
// a prerequisite; it never establishes that an approval or send has happened.
export function communicationReadiness(c,form={},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date())) {
  const selected=c?.communications?.find(m=>m.id===form.messageId&&m.approvedAt);
  const sent=(c?.communications||[]).filter(m=>m.sentDate).at(-1);
  const responses=(c?.communications||[]).filter(m=>m.kind==='response');
  const answered=Boolean(sent&&responses.some(m=>m.replyTo===sent.id||(m.unsolicited&&m.recordedAt>=(sent.sentRecordedAt||sent.approvedAt||''))));
  const locked=!c||Boolean(c.resolution)||Boolean(form.dirty);
  const current=Boolean(selected&&exportMatchesDraft(c,selected.id));
  const dateOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  let sendReason=locked?'Open an active case and save any case or draft edits.':c?.draftKind==='follow-up'&&answered?'A merchant response is recorded. This obsolete unanswered follow-up cannot be recorded as sent.':!selected?'Approve the current email first.':selected.sentDate?'This message is already recorded as sent.':!current?'This approval is outdated. Review and approve the current draft.':!form.sentConfirmed?'Downloading an .eml file does not send it. Send it outside SIR, then confirm actual sending below.':!dateOK(form.sentDate)||!dateOK(form.followUpDate)||form.followUpDate<=form.sentDate?'Enter the actual sent date and a later follow-up review date.':'';
  let responseReason=locked?'Open an active case and save any case or draft edits.':!form.unsolicited&&!selected?.sentDate?'Record the selected message as actually sent first. For an unsolicited message, select the separate option below.':!dateOK(form.receivedDate)?'Enter the date this merchant communication was received.':!form.unsolicited&&form.receivedDate<selected.sentDate?'The response date cannot precede the selected sent message.':!form.responseText?.trim()?'Paste the fictional or anonymised merchant response.':'';
  let followReason=locked?'Open an active case and save any case or draft edits.':c.draftNeedsReview||c.researchNeedsReview?'Review changes and prepare a current draft first.':!sent?'Record your original message as actually sent before a follow-up.':answered?'A merchant communication has been recorded. Review it before deciding on further correspondence.':sent.followUpDate>today?'Wait until your chosen review date: '+sent.followUpDate+'.':c.draftKind==='follow-up'&&!(c.communications||[]).some(m=>m.draftText===c.draft&&m.sentDate)?'Your follow-up draft is already prepared. Review and approve it.':'';
  return {selected,sent,answered,responses,current,canSend:!sendReason,sendReason,canRespond:!responseReason,responseReason,canFollowUp:!followReason,followReason};
}

export function guidedAction(c,ui={}) {
  const action=(stage,title,copy,pane,target,label)=>({stage,title,copy,pane,target,label});
  if(!c){
    if(ui.proposedDirty)return action('corrections','Save your corrections','Save the facts you edited, then confirm your case summary.','assistant','save-intake-corrections','Save my corrections');
    if(ui.intake?.summary?.ready&&!ui.intake.caseId)return ui.intakeConfirmed
      ?action('create','Your facts are confirmed','Create your case to keep your complaint and supporting records together.','assistant','commit-intake','Create my case')
      :action('confirm','Review your case summary','Check the extracted facts. Correct anything needed, then tick the confirmation.','assistant','intake-confirm','Review my facts');
    return action('intake','Tell me what happened',ui.aiReady?'Tell me the company, what went wrong and the outcome you want.':'Enter the company, what happened and the outcome you want to begin.',''+(ui.aiReady?'assistant':'evidence'),ui.aiReady?'ai-message':'merchant',ui.aiReady?'Explain my complaint':'Enter my complaint');
  }
  if(c.resolution)return action('resolved','Your case is closed',c.resolution.note+' Your correspondence and history are retained.','drafts','case-history','View my case history');
  if(ui.caseDirty)return action('case-edits','Save your case changes','Your case details have unsaved changes. Save them before continuing.','evidence','save-details','Save case changes');
  if(ui.draftDirty)return action('draft-edits','Save your edited draft','Keep your wording, then review the complete email for fresh approval.','drafts','save','Save my draft');
  if(ui.preview)return ui.sourceConfirmed
    ?action('save-evidence','Your evidence is ready to save','Save this reviewed record and its original source to your case.','evidence','save-source','Save reviewed evidence')
    :action('review-evidence','Review this evidence','Check the original text, suggested facts and date comparison. Confirm them before saving.','evidence','source-confirm','Review evidence facts');
  const flow=communicationReadiness(c,ui.form,ui.today);
  const response=flow.responses.at(-1);
  const currentApproval=flow.selected?.draftText===c.draft?flow.selected:(c.communications||[]).filter(m=>m.approvedAt&&m.draftText===c.draft).at(-1);
  if(ui.form?.responseText?.trim()){
    if(!ui.form.unsolicited&&!flow.selected?.sentDate)return action('response-prerequisite','Record actual sending before linking this reply','Your response text is still here. Record the original message as sent, or explicitly label this as an unsolicited communication.','drafts','sent-confirm','Review the sending prerequisite');
    if(!flow.canRespond)return action('response-entry','Complete the merchant response',flow.responseReason,'drafts','response-date','Review response details');
    return action('save-response','Your merchant response is ready','Save this communication in case history. The response text stays available if validation fails.','drafts','record-response','Save merchant response');
  }
  const outcomeAction=()=>ui.form?.resolutionNote?.trim()
    ?ui.form.resolutionConfirmed?action('close','Your outcome is ready to record','Save the confirmed outcome to close this case and retain its history.','drafts','resolve-case','Save outcome and close case')
      :action('close-confirm','Confirm this outcome resolves the case','Check the outcome you entered. Confirm closure only if the issue is settled.','drafts','resolution-confirm','Confirm case resolution')
    :action('response','Your merchant response is saved','Read the saved response below. If it settles the issue, describe the outcome here. Otherwise keep the case open and record further correspondence.','drafts','resolution-note','Review response and record outcome');
  // A new follow-up takes precedence over the original message's waiting state.
  const pendingFollow=c.draftKind==='follow-up'&&!flow.answered&&(!currentApproval||!currentApproval.sentDate);
  if(flow.sent&&!pendingFollow){
    if(flow.answered)return outcomeAction();
    return flow.canFollowUp
      ?action('follow-up','Your review date has arrived','No response is recorded. Review the case and prepare a follow-up if it is still needed.','drafts','prepare-follow-up','Prepare my follow-up')
      :action('waiting','Your message is recorded as sent','Await the merchant’s response. Review again on '+flow.sent.followUpDate+'. If a reply arrives, record it below.','drafts','response-text','Record a merchant response');
  }
  if(response&&!flow.sent)return outcomeAction();
  if(c.researchNeedsReview)return action('research','Review research for the current company','The company changed. Review the relevant official policy page and save current passages before refreshing the draft.','evidence','policy-url','Review current policy source');
  if(c.draftNeedsReview){
    if(ui.checks&&!ui.checks.ready)return action('conflict','Resolve the evidence issue before refreshing',ui.checks.issues.join(' '),'evidence','case','Review the evidence issue');
    return action('stale','Your draft needs a fresh review','Saved facts or records have changed. Generate a fresh draft. Earlier versions remain in history.','drafts','regenerate','Review and refresh my draft');
  }
  if(!c.draft){
    const records=(c.evidence||[]).filter(e=>e.active!==false);
    if(!records.length&&!c.accountOnlyConfirmed&&!ui.accountOnly)return action('evidence','Your case is saved. Add supporting records','Upload a receipt, order or other relevant record. If none is available, choose the account-only option on Evidence.','evidence','document-file','Add my evidence');
    if(ui.checks&&!ui.checks.ready&&!(ui.accountOnly&&!records.length))return action('conflict','Your evidence needs attention',ui.checks.issues.join(' ')+' Review the source facts or record why a source should be excluded.','evidence','case','Review the evidence issue');
    return action('draft','Your reviewed facts are ready','The saved records have been checked. Prepare your complaint, then review its wording.','drafts','generate-draft-here','Prepare my complaint');
  }
  if(ui.approvedMatches){
    if(currentApproval?.exportRequestedAt)return action('sent','Your email export was requested','Check the download, review and send it outside SIR. Then record the actual sent date. An export alone never means sent.','drafts','sent-date','Record actual sending');
    return action('export','Your reviewed email is approved','Download the approved .eml file and review it in your email app. Actual sending is a separate action.','drafts','export-email','Download my approved email');
  }
  if(!ui.recipient?.trim()||!ui.subject?.trim())return action('email','Your complaint draft is saved','Email is the next step. Enter the recipient and subject, then review the complete message before approval.','drafts',!ui.recipient?.trim()?'email-recipient':'email-subject','Review my email details');
  if(!ui.emailConfirmed)return action('approve-review','Review the complete email','Check the recipient, subject and full message, then tick the export approval confirmation.','drafts','email-approve-confirm','Review and confirm my email');
  return action('approve','Your email is ready for approval','Approve this exact recipient, subject and message before downloading.','drafts','approve-email','Approve email export');
}

// Presentation copy follows the screen being read; the saved next action still
// determines resume navigation and never grants workflow permissions.
export function stageGuidance(c,pane,next,form={}) {
  const copy=(title,text)=>({title,copy:text});
  if(!c){
    const titles={evidence:'Add evidence to a saved case',drafts:'Prepare a complaint for a saved case',email:'Review an email for a saved case',activity:'Track the outcome of a saved case',history:'Review a saved case record'};
    return titles[pane]?copy(titles[pane],'Create a case in Tell SIR or open one from My cases to continue here.'):next;
  }
  if(['cases','history'].includes(pane)||c.resolution)return next;
  const names={assistant:'Tell SIR',evidence:'Evidence',drafts:'Complaint',email:'Email',activity:'Outcome'};
  const resume=next.pane!==pane?' Next step: '+(names[next.pane]||'review the case')+'.':'';
  if(pane==='activity'){
    if(['response-prerequisite','response-entry','save-response','close','close-confirm','response','waiting','follow-up','sent'].includes(next.stage))return next;
    const flow=communicationReadiness(c,form);
    if(flow.sent)return copy('Track your complaint outcome','A complaint is recorded as sent. Save any further merchant response, or record the actual resolution when the issue is settled.'+resume);
    return copy('Record what happened next','No outgoing complaint is recorded as sent. To link a reply, first send the approved email outside SIR and record the actual sending. If the merchant contacted you independently, select the unsolicited communication option. Record a resolution only when the issue is settled.'+resume);
  }
  if(next.pane===pane)return next;
  if(pane==='evidence')return copy('Review your supporting records','Add or review relevant records here. Check extracted facts before saving; original sources remain with the case.'+resume);
  if(pane==='drafts')return copy(c.draft?'Review your complaint':'Prepare your complaint',c.draft?'Read the saved wording and save any edits. Continue to email review when the draft is ready.'+resume:'Review your evidence or explicitly choose the account-only option before preparing a complaint.'+resume);
  if(pane==='email')return copy('Review your email','Check the recipient, subject and full message. Approval applies to this exact email; the downloaded file remains unsent.'+resume);
  if(pane==='assistant')return copy('Your case is saved','Your conversation and confirmed facts are retained. Continue with the saved case using the sidebar.'+resume);
  return next;
}

export function emailPreview(recipient,subject,draft) {
  return 'To: '+(recipient.trim()||'[recipient not entered]')+'\nSubject: '+subject+'\n\n'+draft.replace(/^Subject:[^\r\n]*\r?\n(?:\r?\n)?/i,'');
}

export function recipientDescription(recipient) {
  const address=recipient.trim();
  if(!address)return 'No recipient entered. The example in the field is a placeholder and is not used in the preview or export.';
  if(/@(?:[^@]+\.)?example(?:\.(?:com|org|net))?$/i.test(address))return 'Entered example address for testing only. It is not a verified merchant contact.';
  return 'The preview uses the recipient entered above. Check it against the merchant’s published complaint address before approving.';
}

export function visibleStatus(text) {
  return /^(?:Done\. |Saved\. |Your (?:saved |resolved )?case (?:and (?:draft|its history) )?(?:is|are) restored\.|The fictional records agree\.|Tell me what happened,|Case created from reviewed conversation facts\.)/.test(text)?'':text;
}
