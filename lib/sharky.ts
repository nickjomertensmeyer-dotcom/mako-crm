export type ChatMessage={role:'user'|'assistant';content:string};
export function clampBubble(x:number,y:number,width:number,height:number){
  return {x:Math.max(12,Math.min(Number.isFinite(x)?x:width-84,Math.max(12,width-76))),y:Math.max(12,Math.min(Number.isFinite(y)?y:height-84,Math.max(12,height-76)))};
}
export function chatPayload(value:unknown):{question:string;history:ChatMessage[]}{
  if(!value||typeof value!=='object')throw new Error('Enter a message to Fin.');
  const body=value as Record<string,unknown>;const question=typeof body.question==='string'?body.question.trim():'';
  if(!question||question.length>2000)throw new Error('Use a message between 1 and 2,000 characters.');
  if(body.history!==undefined&&!Array.isArray(body.history))throw new Error('Invalid conversation. Start a new chat.');
  const input=(body.history||[]) as unknown[];
  if(input.length>8)throw new Error('Please start a new chat or shorten the conversation.');
  const history=input.map(item=>{
    if(!item||typeof item!=='object')throw new Error('Invalid conversation.');
    const message=item as Record<string,unknown>;
    if((message.role!=='user'&&message.role!=='assistant')||typeof message.content!=='string'||!message.content.trim()||message.content.length>2000)throw new Error('Invalid conversation message.');
    return {role:message.role,content:message.content.trim()} as ChatMessage;
  });
  if(history.reduce((sum,item)=>sum+item.content.length,0)>10000)throw new Error('Please start a new chat or shorten the conversation.');
  return {question,history};
}
export async function readChatRequest(request:Request){
  if(Number(request.headers.get('content-length')||0)>48000)throw new Error('Please shorten your message or start a new chat.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Enter a message to Fin.');
  const decoder=new TextDecoder();let size=0,text='';
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>48000){await reader.cancel();throw new Error('Please shorten your message or start a new chat.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  finally{reader.releaseLock();}
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new Error('Invalid conversation. Please try again.');}
  return chatPayload(parsed);
}
export function demoSharkyReply(question:string){
  if(/quote|follow.?up|proposal/i.test(question))return 'Here’s a sample you can adapt:\n\nHi [name], just checking in on the quote we sent for [service]. Happy to answer questions or help with the next step. Would a quick chat this week work?\n\nReplace the placeholders and review before sending. This demo does not send messages.';
  if(/prioriti|plan|day|task/i.test(question))return 'Try this simple plan:\n1. Review overdue tasks and follow-ups due today.\n2. Confirm upcoming jobs and appointments.\n3. Follow up on open quotes.\n4. Reserve time for your highest-value work.\n\nOpen Tasks to set owners and due dates. This is sample guidance, not a review of your records.';
  if(/onboard|checklist|customer/i.test(question))return 'A sample customer onboarding checklist:\n• Confirm contact details and the agreed scope.\n• Assign an owner and next step.\n• Schedule the work.\n• Record any agreed deposit.\n• Create a follow-up task.\n\nThis demo reply does not create or change records.';
  return 'Hi, I’m Fin! In the demo I can show sample guidance for quote follow-ups, planning your day, or customer onboarding. Try one of those topics. Live AI replies require a configured provider on an active workspace.';
}
