import {connectionContext} from '@/lib/connections';
import {calendarConfig,calendarDatabase} from '@/lib/google-calendar';
import {boundedBody} from '@/lib/request-body';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){const ctx=await connectionContext();if(ctx.role!=='owner')return json({error:'Only workspace owners can manage the website form.'},403);const {data,error}=await calendarDatabase().from('website_lead_forms').select('id,title,enabled').eq('workspace_id',ctx.business.id).maybeSingle();if(error)return json({error:'Website forms need a database update.'},503);return json({form:data,url:data?`${calendarConfig().origin}/forms/${data.id}`:null});}
export async function POST(request:Request){
 const ctx=await connectionContext();if(ctx.role!=='owner')return json({error:'Only workspace owners can manage the website form.'},403);
 if(request.headers.get('origin')!==calendarConfig().origin)return json({error:'Reload and try again.'},403);
 if(!ctx.business.modules.includes('leads'))return json({error:'Enable Leads in business settings first.'},400);
 try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,4096)));if(typeof body.enabled!=='boolean'||typeof body.title!=='string'||body.title.trim().length<3||body.title.length>100)return json({error:'Enter a form title between 3 and 100 characters.'},400);
 const {data,error}=await calendarDatabase().from('website_lead_forms').upsert({workspace_id:ctx.business.id,title:body.title.trim(),enabled:body.enabled},{onConflict:'workspace_id'}).select('id,title,enabled').single();if(error)throw error;return json({form:data,url:`${calendarConfig().origin}/forms/${data.id}`,message:data.enabled?'Website form enabled. Add this link to your website.':'Website form disabled. Existing leads remain in Mako.'});
 }catch{return json({error:'Could not save the website form.'},400);}
}
