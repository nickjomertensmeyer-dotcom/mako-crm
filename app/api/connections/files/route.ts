import {connectionContext,connectionToken,providerJson} from '@/lib/connections';
import {boundedBody} from '@/lib/request-body';
import {calendarConfig,calendarDatabase} from '@/lib/google-calendar';
import {safeFileLink} from '@/lib/connections-model';
export const runtime='nodejs';export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){
 const ctx=await connectionContext();if(request.headers.get('origin')!==calendarConfig().origin)return json({error:'Reload and try again.'},403);
 if(Number(request.headers.get('content-length'))>5500000)return json({error:'Files must be 5 MB or smaller.'},413);
 try{
  const bytes=await boundedBody(request,5500000),form=await new Response(bytes.buffer as ArrayBuffer,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(),file=form.get('file'),contactId=form.get('contactId');
  if(!(file instanceof File)||file.size<1||file.size>5*1024*1024||!['application/pdf','image/png','image/jpeg','image/webp','text/plain'].includes(file.type)||typeof contactId!=='string')return json({error:'Choose a PDF, PNG, JPEG, WebP, or text file up to 5 MB.'},400);
  const {data:contact}=await ctx.client.from('contacts').select('id').eq('workspace_id',ctx.business.id).eq('id',contactId).is('archived_at',null).maybeSingle();if(!contact)return json({error:'Choose an available customer or lead.'},404);
  const token=await connectionToken('google-drive',ctx.business.id,ctx.user.id),boundary=`mako-${crypto.randomUUID()}`,name=Array.from(file.name).filter(char=>char.charCodeAt(0)>=32).join('').slice(0,180)||'Attachment';
  const metadata=JSON.stringify({name,description:'Uploaded through Mako CRM. Sharing permissions are managed in Google Drive.'});
  const data=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,await file.arrayBuffer(),`\r\n--${boundary}--`]);
  const result=await providerJson<{id:string;webViewLink?:string}>('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',token,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:data});
  const url=safeFileLink(result.webViewLink)||`https://drive.google.com/file/d/${encodeURIComponent(result.id)}/view`;
  const {error}=await calendarDatabase().from('connected_files').insert({workspace_id:ctx.business.id,user_id:ctx.user.id,contact_id:contact.id,provider:'google-drive',external_id:result.id,name,url});
  if(error)return json({error:'Uploaded to Google Drive, but the Mako link could not be saved. Check Drive before uploading again.'},502);
  return json({message:'File uploaded to your Google Drive and linked to this contact. It stays private according to your Drive permissions.'});
 }catch(error){return json({error:error instanceof Error?error.message:'Upload could not be confirmed. Check Drive before trying again.'},502);}
}
