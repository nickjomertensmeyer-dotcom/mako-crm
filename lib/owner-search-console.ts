import 'server-only';
import {supabase} from './supabase/server';
import {calendarConfig,calendarDatabase,googleToken} from './google-calendar';
import {openCalendar} from './google-calendar-security';
import {searchProperty,searchHome,searchWindow,type SearchReport,type SearchRow} from './search-console-model';

export const searchTable='owner_search_connections';
export async function searchOwner(){
 const client=await supabase(),{data,error}=await client.auth.getUser();
 if(error||!data.user)return null;
 const admin=await client.rpc('is_platform_admin');
 return !admin.error&&admin.data?data.user:null;
}
export function searchConfig(){const config=calendarConfig();return {...config,redirect:`${config.origin}/api/owner/search-console/callback`};}
export const searchAAD=(uid:string)=>`owner-search:${uid}:${searchProperty}`;
export class SearchApiError extends Error{constructor(public status:number){super('Search Console request failed');}}
export async function searchRequest<T>(url:string,token:string,body?:unknown):Promise<T>{
 const response=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new SearchApiError(response.status);
 return response.json();
}
export const searchBase=`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(searchProperty)}`;
export async function loadSearchReport(uid:string,credential:string,days:number):Promise<SearchReport>{
 const config=searchConfig();
 const token=await googleToken({client_id:config.id,client_secret:config.secret,grant_type:'refresh_token',refresh_token:openCalendar(credential,config.key,searchAAD(uid))});
 const window=searchWindow(days),query=(start:string,end:string,dimensions?:string[],rowLimit=10)=>searchRequest<{rows?:SearchRow[]}>(`${searchBase}/searchAnalytics/query`,token.access_token,{startDate:start,endDate:end,type:'web',dataState:'final',...(dimensions?{dimensions,rowLimit}:{})});
 const results=await Promise.allSettled([
  query(window.start,window.end),query(window.previousStart,window.previousEnd),query(window.start,window.end,['date'],90),query(window.start,window.end,['query']),query(window.start,window.end,['page']),
  searchRequest<{inspectionResult?:{indexStatusResult?:{verdict?:string;coverageState?:string;lastCrawlTime?:string}}}>('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',token.access_token,{inspectionUrl:searchHome,siteUrl:searchProperty,languageCode:'en-US'}),
  searchRequest<{sitemap?:{path?:string;isPending?:boolean;errors?:string;warnings?:string;lastDownloaded?:string;contents?:{submitted?:string}[]}[]}>(`${searchBase}/sitemaps`,token.access_token),
 ]);
 const labels=['Search totals','Previous period','Daily trend','Search terms','Top pages','Homepage indexing','Sitemap status'];
 const issues=results.flatMap((r,i)=>r.status==='rejected'?[`${labels[i]} unavailable${r.reason instanceof SearchApiError&&r.reason.status===403?' — check Google permission and API setup':''}.`]:[]);
 const rows=(i:number)=>results[i].status==='fulfilled'?(results[i].value as {rows?:SearchRow[]}).rows||[]:null;
 const totals=(i:number)=>{const values=rows(i);return values?values[0]||{clicks:0,impressions:0,ctr:0,position:0}:null;};
 const inspection=results[5].status==='fulfilled'?(results[5].value as {inspectionResult?:{indexStatusResult?:{verdict?:string;coverageState?:string;lastCrawlTime?:string}}}).inspectionResult?.indexStatusResult:null;
 const sitemap=results[6].status==='fulfilled'?(results[6].value as {sitemap?:{path?:string;isPending?:boolean;errors?:string;warnings?:string;lastDownloaded?:string;contents?:{submitted?:string}[]}[]}).sitemap||[]:null;
 return {days,...window,fetchedAt:new Date().toISOString(),totals:totals(0),previous:totals(1),daily:rows(2)?.sort((a,b)=>(a.keys?.[0]||'').localeCompare(b.keys?.[0]||''))||rows(2),queries:rows(3),pages:rows(4),indexing:inspection?{verdict:inspection.verdict||'UNKNOWN',coverage:inspection.coverageState||'No indexing information yet',lastCrawl:inspection.lastCrawlTime||null}:null,sitemaps:sitemap===null?null:sitemap.map(s=>({path:s.path||'',pending:Boolean(s.isPending),errors:Number(s.errors)||0,warnings:Number(s.warnings)||0,lastRead:s.lastDownloaded||null,submitted:(s.contents||[]).reduce((n,c)=>n+(Number(c.submitted)||0),0)})),issues};
}
export async function savedSearch(uid:string){return calendarDatabase().from(searchTable).select('credential,report,updated_at').eq('user_id',uid).maybeSingle();}
