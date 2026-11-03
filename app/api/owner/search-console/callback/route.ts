import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {searchOwner,searchConfig,searchRequest,searchBase,searchTable,searchAAD} from '@/lib/owner-search-console';
import {calendarDatabase,googleToken} from '@/lib/google-calendar';
import {openCalendar,sealCalendar,matchesState} from '@/lib/google-calendar-security';
import {searchScope} from '@/lib/search-console-model';
export async function GET(request:Request){
 const finish=(message:string)=>{const url=new URL('/owner',request.url);url.searchParams.set('message',message);url.hash='google-search';const response=NextResponse.redirect(url);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;};
 const store=await cookies(),saved=store.get('mako-owner-search-oauth')?.value;store.delete({name:'mako-owner-search-oauth',path:'/api/owner/search-console'});
 try{
  const config=searchConfig(),query=new URL(request.url).searchParams;
  if(!saved)return finish('Google Search connection expired. Please start again.');
  const state=JSON.parse(openCalendar(saved,config.key,'owner-search-oauth'));
  if(state.expires<Date.now()||typeof state.state!=='string'||!matchesState(state.state,query.get('state')||''))return finish('Google Search connection expired. Please start again.');
  const user=await searchOwner();if(!user||user.id!==state.uid)return finish('Sign in to the owner account that started this connection.');
  if(query.has('error'))return finish('Google Search connection cancelled.');
  const code=query.get('code');if(!code||code.length>4096)return finish('Invalid Google connection response.');
  const token=await googleToken({client_id:config.id,client_secret:config.secret,redirect_uri:config.redirect,grant_type:'authorization_code',code,code_verifier:state.verifier});
  if(!token.refresh_token||!token.scope?.split(' ').includes(searchScope))return finish('Read-only Search Console permission is required. Please reconnect.');
  await searchRequest(searchBase,token.access_token);
  const {error}=await calendarDatabase().from(searchTable).upsert({user_id:user.id,credential:sealCalendar(token.refresh_token,config.key,searchAAD(user.id)),scopes:searchScope,report:null,updated_at:new Date().toISOString()});
  return finish(error?'Could not save Google Search connection. Please try again.':'Google Search connected. Search reports are available below.');
 }catch{return finish('Could not connect Google Search. Use the Google account with access to usemakocrm.com and check API setup.');}
}
