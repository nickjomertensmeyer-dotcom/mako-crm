import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

export const calendarScope='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export function canEditGoogleCalendar(scopes:string){return scopes.split(' ').includes('https://www.googleapis.com/auth/calendar.events');}
export function canReadGoogleCalendar(scopes:string){const granted=new Set(scopes.split(' '));return granted.has('https://www.googleapis.com/auth/calendar.calendarlist.readonly')&&(canEditGoogleCalendar(scopes)||granted.has('https://www.googleapis.com/auth/calendar.events.readonly'));}
export function calendarOrigin(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Invalid calendar site URL');
 return url.origin;
}
export function encryptionKey(value:string){
 if(!/^[a-f0-9]{64}$/i.test(value))throw new Error('Calendar encryption key must be 32 random bytes in hex');
 return Buffer.from(value,'hex');
}
export function sealCalendar(value:string,key:Buffer,context:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(context));
 const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}
export function openCalendar(value:string,key:Buffer,context:string){
 const bytes=Buffer.from(value,'base64url');if(bytes.length<29)throw new Error('Invalid calendar ciphertext');
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
export function validTimeZone(value:unknown):value is string{
 if(typeof value!=='string'||value.length>100)return false;
 try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}
}
export function matchesState(expected:string,actual:string){
 const a=Buffer.from(expected),b=Buffer.from(actual);return a.length===b.length&&timingSafeEqual(a,b);
}
export function eventId(workspace:string,record:string){return createHash('sha256').update(`${workspace}:${record}`).digest('hex');}
export function calendarEvent(item:{id:string;title:string;kind:string;status:string;scheduled_date:string;scheduled_time:string|null},workspace:string,zone:string,origin:string){
 const start=new Date(`${item.scheduled_date}T${item.scheduled_time||'00:00:00'}Z`);
 if(!Number.isFinite(start.getTime()))throw new Error('Invalid work date');
 // Work records currently have no duration. Timed exports explicitly use a one-hour block.
 const end=new Date(start.getTime()+(item.scheduled_time?3600000:86400000));
 const timing=item.scheduled_time?{start:{dateTime:start.toISOString().slice(0,19),timeZone:zone},end:{dateTime:end.toISOString().slice(0,19),timeZone:zone}}:{start:{date:item.scheduled_date},end:{date:end.toISOString().slice(0,10)}};
 return {id:eventId(workspace,item.id),summary:`${item.status==='Cancelled'?'[Cancelled] ':''}${item.title}`,description:`${item.kind} · ${item.status}\nManaged in Mako. ${item.scheduled_time?'One-hour calendar block; duration is not recorded in Mako.':''}`,source:{title:'Open in Mako',url:`${origin}/workspace?view=${item.kind==='Job'?'jobs':'schedule'}&editWork=${encodeURIComponent(item.id)}`},transparency:item.status==='Cancelled'?'transparent':'opaque',...timing};
}
type Item=Parameters<typeof calendarEvent>[0];
type GoogleRequest=(path:string,method:string,body:unknown)=>Promise<unknown>;
export async function syncCalendarEvents(items:Item[],workspace:string,zone:string,origin:string,calendar:string,request:GoogleRequest){
 let completed=0;
 for(let i=0;i<items.length;i+=5){
  // Wait for every write before releasing the connection lock, even if one fails.
  const batch=await Promise.allSettled(items.slice(i,i+5).map(async item=>{
   const event=calendarEvent(item,workspace,zone,origin),base=`calendars/${encodeURIComponent(calendar)}/events`;
   try{await request(`${base}/${event.id}`,'PUT',event);}
   catch(error){if(!error||typeof error!=='object'||!('status' in error)||error.status!==404)throw error;
    try{await request(base,'POST',event);}catch(insertError){
     if(!insertError||typeof insertError!=='object'||!('status' in insertError)||insertError.status!==409)throw insertError;
     await request(`${base}/${event.id}`,'PUT',event);
    }
   }
  }));
  completed+=batch.filter(r=>r.status==='fulfilled').length;
  if(batch.some(r=>r.status==='rejected'))return {completed,complete:false};
 }
 return {completed,complete:true};
}

