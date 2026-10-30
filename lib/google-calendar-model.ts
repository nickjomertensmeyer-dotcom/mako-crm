export type GoogleEvent={id:string;title:string;date:string;through:string;time:string;endLabel:string;allDay:boolean;url?:string;recurring?:boolean;etag?:string;locked?:boolean};
export type GoogleApiEvent={id?:string;summary?:string;status?:string;htmlLink?:string;etag?:string;recurringEventId?:string;locked?:boolean;start?:{date?:string;dateTime?:string};end?:{date?:string;dateTime?:string}};
function localParts(date:Date,zone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=(name:string)=>parts.find(p=>p.type===name)?.value||'';
 return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
export function calendarWindow(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choose a valid calendar month.');
 const [year,m]=month.split('-').map(Number);if(year<1970||year>2100)throw new Error('Choose a calendar month between 1970 and 2100.');
 const first=new Date(Date.UTC(year,m-1,1)),start=new Date(first);start.setUTCDate(1-first.getUTCDay());
 // One-day margin covers UTC offsets on both sides of the six-week calendar grid.
 return {timeMin:new Date(start.getTime()-86400000).toISOString(),timeMax:new Date(start.getTime()+43*86400000).toISOString()};
}
export function normalizeGoogleEvent(event:GoogleApiEvent,zone:string):GoogleEvent|null{
 if(!event.id||event.status==='cancelled'||!event.start||!event.end)return null;
 let date:string,through:string,endLabel:string,time='';const allDay=Boolean(event.start.date);
 if(allDay){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(event.start.date||'')||!/^\d{4}-\d{2}-\d{2}$/.test(event.end.date||''))return null;
  date=event.start.date!;const end=new Date(`${event.end.date}T00:00:00Z`);if(!Number.isFinite(end.getTime()))return null;end.setUTCDate(end.getUTCDate()-1);through=end.toISOString().slice(0,10);endLabel='All day';
 }else{
  const start=new Date(event.start.dateTime||''),end=new Date(event.end.dateTime||'');if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return null;
  const a=localParts(start,zone),b=localParts(end,zone);date=a.date;time=a.time;through=localParts(new Date(end.getTime()-1),zone).date;endLabel=b.date===a.date?b.time:`${b.date} ${b.time}`;
 }
 if(through<date)return null;
 let url:string|undefined;try{const link=new URL(event.htmlLink||'');if(link.protocol==='https:'&&['calendar.google.com','www.google.com'].includes(link.hostname))url=link.href;}catch{/* Missing or untrusted links are intentionally omitted. */}
 return {id:event.id,title:(event.summary||'Busy / private event').slice(0,500),date,through,time,endLabel,allDay,recurring:Boolean(event.recurringEventId),etag:event.etag,locked:event.locked,...(url?{url}:{})};
}
export function googleEventsOnDay(events:GoogleEvent[],day:string){return events.filter(event=>event.date<=day&&event.through>=day);}
