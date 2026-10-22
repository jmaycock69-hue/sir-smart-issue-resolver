// Deliberately bounded rehearsal, not an AI model. Proposals still pass through
// ConversationService's quotation checks and the production case workflow.
export const demoMessages = [
  'My complaint is about Acorn Outdoor Supplies.',
  'I paid GBP 89.00 on 2026-10-01 for a camping stove that was never delivered.',
  'I want a refund of GBP 89.00 and written confirmation.'
];
export class DemoProvider {
  async respond({message, facts}) {
    const text=message.trim();
    let updates=[];
    if(text===demoMessages[0]) updates=[{field:'merchant',value:'Acorn Outdoor Supplies',quote:'Acorn Outdoor Supplies'}];
    if(text===demoMessages[1]) updates=[
      {field:'issue',value:text,quote:text},
      {field:'complaintType',value:'non-delivery',quote:'never delivered'},
      {field:'amount',value:'89.00',quote:'89.00'},
      {field:'currency',value:'GBP',quote:'GBP'},
      {field:'charged',value:'2026-10-01',quote:'2026-10-01'}
    ];
    if(text===demoMessages[2]) updates=[{field:'desiredOutcome',value:text,quote:text}];
    const proposed={...facts,...Object.fromEntries(updates.map(u=>[u.field,u.value]))};
    const reply=!updates.length
      ? 'Scripted demonstration: use the three example messages in order, or enter and correct your own facts in the review controls. This mode does not interpret arbitrary conversation.'
      : !proposed.merchant?'Scripted demonstration: which company is your complaint about?'
      : !proposed.issue?'Scripted demonstration: what happened with your purchase?'
      : !proposed.desiredOutcome?'Scripted demonstration: what would you like the company to do to put this right?'
      : 'Review the proposed facts before creating your case.';
    return {reply,updates};
  }
}
