import {connectReady,merchantStatus} from '@/lib/stripe-connect';
import {connectionContext,startGoogleConnection} from '@/lib/connections';
import {boundedBody} from '@/lib/request-body';
import {qbReady,startQuickBooks} from '@/lib/quickbooks';
import {calendarConfig,calendarDatabase} from '@/lib/google-calendar';
import {connectionApps,appDefinition,connectionComingSoon,quickBooksComingSoonMessage} from '@/lib/connections-model';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){
 const ctx=await connectionContext(false);const db=calendarDatabase();
 const [apps,calendar]=await Promise.all([db.from('app_connections').select('provider,account_label,created_at,updated_at').eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id),db.from('google_calendar_connections').select('scopes,created_at').eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id).maybeSingle()]);
 let merchant={connected:false,ready:false,label:'Stripe invoice payments are not configured.'};if(connectReady()){try{merchant=await merchantStatus(ctx.business.id);}catch{merchant.label='Stripe setup needs attention.';}}
 let googleReady=false;try{calendarConfig();googleReady=true;}catch{/* Report setup needed without exposing configuration. */}
 return json({databaseReady:!apps.error,apps:connectionApps.map(app=>{const saved=apps.data?.find(c=>c.provider===app.id);return {...app,scope:undefined,connected:app.id==='stripe'?merchant.connected:app.id==='google-calendar'?Boolean(calendar.data):Boolean(saved),configured:app.id==='stripe'?connectReady():app.id==='quickbooks'?qbReady():app.id.startsWith('google')||app.id==='gmail'?googleReady:false,label:app.id==='stripe'?merchant.label:saved?.account_label||'',connectedAt:saved?.created_at||(app.id==='google-calendar'?calendar.data?.created_at:null)};})});
}
export async function POST(request:Request){
 const ctx=await connectionContext(false);let config;try{config=calendarConfig();}catch{return json({error:'Mako needs to finish Google application setup.'},503);}
 if(request.headers.get('origin')!==config.origin)return json({error:'Reload Mako and try again.'},403);
 let body;try{body=JSON.parse(new TextDecoder().decode(await boundedBody(request,4096)));}catch{return json({error:'Invalid connection request.'},400);}
 const definition=appDefinition(body?.provider);if(!definition)return json({error:'Unknown app.'},400);
 if(body.action==='disconnect'){
  const table=definition.id==='google-calendar'?'google_calendar_connections':'app_connections';let query=calendarDatabase().from(table).delete().eq('workspace_id',ctx.business.id).eq('user_id',ctx.user.id);if(table==='app_connections')query=query.eq('provider',definition.id);const {error}=await query;
  if(error)return json({error:'Could not disconnect. Try again.'},503);
  return json({message:`${definition.name} disconnected from this workspace. Existing records and source files are unchanged. Revoke the app in your provider account to remove provider-side permission.`});
 }
 if(body.action==='connect'&&connectionComingSoon(definition.id))return json({error:quickBooksComingSoonMessage},503);
 if(body.action==='connect'&&(definition.scope||definition.id==='quickbooks')){if(ctx.business.archived_at||ctx.business.status!=='active'||!['pro','custom'].includes(ctx.business.plan))return json({error:'Activate your plan before connecting apps.'},403);if(definition.id==='quickbooks'&&ctx.role!=='owner')return json({error:'Only the workspace owner can connect accounting.'},403);try{return json({url:definition.id==='quickbooks'?await startQuickBooks(ctx.business.id,ctx.user.id):await startGoogleConnection(definition.id,ctx.business.id,ctx.user.id)});}catch(error){return json({error:error instanceof Error?error.message:'Could not start connection. Check application setup.'},503);}}
 return json({error:'This provider needs application setup before it can be connected.'},503);
}
