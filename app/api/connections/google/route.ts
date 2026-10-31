import {connectionContext,connectionToken,providerJson} from '@/lib/connections';
import {boundedBody} from '@/lib/request-body';
import {calendarConfig,calendarDatabase} from '@/lib/google-calendar';
import {normalizePerson,mailPayload,contactImportMessage,type ImportedPerson} from '@/lib/connections-model';
export const runtime='nodejs';export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export async function GET(request:Request){
 const ctx=await connectionContext(),params=new URL(request.url).searchParams,mode=params.get('mode');
 try{
  if(mode==='contacts'){
   const page=params.get('page')||'';if(page.length>2048)return json({error:'Invalid page.'},400);
   const query=new URLSearchParams({personFields:'names,emailAddresses,phoneNumbers,organizations',pageSize:'100',sortOrder:'FIRST_NAME_ASCENDING',...(page?{pageToken:page}:{})});
   const token=await connectionToken('google-contacts',ctx.business.id,ctx.user.id),data=await providerJson<{connections?:Parameters<typeof normalizePerson>[0][];nextPageToken?:string}>(`https://people.googleapis.com/v1/people/me/connections?${query}`,token);
   return json({people:(data.connections||[]).map(normalizePerson).filter(Boolean),next:data.nextPageToken||''});
  }
  if(mode==='records'){
   const {data,error}=await ctx.client.from('contacts').select('id,name,email,stage').eq('workspace_id',ctx.business.id).is('archived_at',null).order('name').limit(1000);if(error)throw error;return json({records:data});
  }
  if(mode==='history'){
   const contact=params.get('contact');if(!uuid(contact))return json({error:'Choose a contact.'},400);
   const valid=await ctx.client.from('contacts').select('id').eq('workspace_id',ctx.business.id).eq('id',contact).maybeSingle();if(!valid.data)return json({error:'Contact unavailable.'},404);
   const [messages,files]=await Promise.all(['connected_messages','connected_files'].map(table=>calendarDatabase().from(table).select(table==='connected_files'?'id,name,url,created_at':'id,subject,status,created_at').eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id).eq('contact_id',contact).order('created_at',{ascending:false}).limit(50)));
   if(messages.error||files.error)throw new Error('History unavailable');return json({messages:messages.data,files:files.data});
  }
  return json({error:'Choose an action.'},400);
 }catch(error){return json({error:error instanceof Error?error.message:'Could not load provider data.'},502);}
}
export async function POST(request:Request){
 const ctx=await connectionContext();if(request.headers.get('origin')!==calendarConfig().origin)return json({error:'Reload and try again.'},403);
 try{
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,50000)));
  if(body.action==='import'){
   if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>25||body.ids.some((id:unknown)=>typeof id!=='string'||!/^people\/[\w-]{1,256}$/.test(id))||!['Lead','Customer'].includes(body.stage))return json({error:'Choose up to 25 contacts and a destination.'},400);
   const token=await connectionToken('google-contacts',ctx.business.id,ctx.user.id),people:ImportedPerson[]=[];
   for(let offset=0;offset<body.ids.length;offset+=5){const batch=await Promise.all((body.ids.slice(offset,offset+5) as string[]).map(id=>providerJson<Parameters<typeof normalizePerson>[0]>(`https://people.googleapis.com/v1/${id}?personFields=names,emailAddresses,phoneNumbers,organizations`,token)));for(const person of batch){const normalized=normalizePerson(person);if(normalized)people.push(normalized);}}
   const {data,error}=await ctx.client.rpc('import_connected_contacts',{target:ctx.business.id,source_name:'google-contacts',people,contact_stage:body.stage});if(error)return json({error:'Could not import contacts. Check enabled tools and access.'},400);return json({message:contactImportMessage(data)});
  }
  if(body.action==='send'){
   if(!uuid(body.contactId)||!uuid(body.id)||typeof body.subject!=='string'||typeof body.body!=='string')return json({error:'Check your message fields.'},400);
   const {data:contact}=await ctx.client.from('contacts').select('id,email').eq('workspace_id',ctx.business.id).eq('id',body.contactId).is('archived_at',null).maybeSingle();if(!contact)return json({error:'Contact unavailable.'},404);
   const raw=Buffer.from(mailPayload(contact.email,body.subject,body.body)).toString('base64url'),token=await connectionToken('gmail',ctx.business.id,ctx.user.id),db=calendarDatabase();
   const inserted=await db.from('connected_messages').insert({id:body.id,workspace_id:ctx.business.id,user_id:ctx.user.id,contact_id:contact.id,provider:'gmail',subject:body.subject,status:'Sending'});
   if(inserted.error)return json({error:'This send request was already submitted or cannot be recorded. Check history before trying again.'},409);
   try{
    const result=await providerJson<{id:string}>('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw})});
    const saved=await db.from('connected_messages').update({status:'Sent',provider_id:result.id}).eq('id',body.id).eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id);if(saved.error)return json({error:'Google accepted the email, but Mako could not update history. Check Gmail Sent before sending again.'},502);
    return json({message:'Email sent through your connected Gmail account.'});
   }catch{await db.from('connected_messages').update({status:'Uncertain'}).eq('id',body.id).eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id);return json({error:'Delivery could not be confirmed. Check Gmail Sent before creating another send request.'},502);}
  }
  return json({error:'Unknown action.'},400);
 }catch(error){return json({error:error instanceof Error?error.message:'Could not complete this action.'},400);}
}
