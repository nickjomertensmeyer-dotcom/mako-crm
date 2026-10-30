import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {calendarOrigin,encryptionKey} from './google-calendar-security';

export function calendarConfig(){
 const {GOOGLE_CALENDAR_CLIENT_ID:id,GOOGLE_CALENDAR_CLIENT_SECRET:secret,GOOGLE_CALENDAR_ENCRYPTION_KEY:key,NEXT_PUBLIC_SITE_URL:site,SUPABASE_SECRET_KEY:dbKey,NEXT_PUBLIC_SUPABASE_URL:dbUrl}=process.env;
 if(!id||!secret||!key||!site||!dbKey||!dbUrl)throw new Error('Google Calendar setup is not finished. Contact Mako to enable this connection.');
 const origin=calendarOrigin(site);
 return {id,secret,key:encryptionKey(key),origin,redirect:`${origin}/api/google-calendar/callback`};
}
export function calendarDatabase(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});}
export class GoogleCalendarError extends Error{constructor(public status:number){super('Google Calendar request failed');}}
export async function googleToken(body:Record<string,string>){
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new GoogleCalendarError(response.status);
 return response.json() as Promise<{access_token:string;refresh_token?:string;scope?:string}>;
}
export async function googleCalendar<T>(token:string,path:string,method='GET',body?:unknown,etag?:string):Promise<T>{
 const response=await fetch(`https://www.googleapis.com/calendar/v3/${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new GoogleCalendarError(response.status);
 return response.status===204?undefined as T:response.json();
}
