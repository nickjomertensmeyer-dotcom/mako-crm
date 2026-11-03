export const searchProperty = 'sc-domain:usemakocrm.com';
export const searchHome = 'https://usemakocrm.com/';
export const searchScope = 'https://www.googleapis.com/auth/webmasters.readonly';
export const searchConsoleLink = 'https://search.google.com/search-console?resource_id=sc-domain%3Ausemakocrm.com';
export type SearchRow = {keys?:string[];clicks:number;impressions:number;ctr:number;position:number};
export type SearchMetrics = Omit<SearchRow,'keys'>;
export type SearchReport = {
 days:number;start:string;end:string;previousStart:string;previousEnd:string;fetchedAt:string;
 totals:SearchMetrics|null;previous:SearchMetrics|null;daily:SearchRow[]|null;queries:SearchRow[]|null;pages:SearchRow[]|null;
 indexing:{verdict:string;coverage:string;lastCrawl:string|null}|null;
 sitemaps:{path:string;pending:boolean;errors:number;warnings:number;lastRead:string|null;submitted:number}[]|null;
 issues:string[];
};
export type SearchDashboard = {connected:boolean;configured:boolean;databaseReady:boolean;report?:SearchReport;error?:string};
export function searchPeriod(value:unknown){return [7,28,90].includes(Number(value))?Number(value):28;}
export function searchWindow(days:number,now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(name:string)=>parts.find(p=>p.type===name)!.value;
 const today=`${part('year')}-${part('month')}-${part('day')}`;
 const shift=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 const end=shift(today,-3),start=shift(end,1-days),previousEnd=shift(start,-1),previousStart=shift(start,-days);
 return {start,end,previousStart,previousEnd};
}
export function searchChange(current:number,previous:number){return previous>0?`${current>=previous?'+':''}${((current-previous)/previous*100).toFixed(1)}%`:current>0?'New activity':'No change';}
export function safeSearchPage(value:string){try{const url=new URL(value);return url.origin==='https://usemakocrm.com'?url.href:null;}catch{return null;}}
