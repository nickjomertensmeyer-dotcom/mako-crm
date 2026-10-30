// Resolve series IDs from Google, never from a caller-supplied parent ID.
type EventMetadata={id?:string;etag?:string;recurringEventId?:string;status?:string;locked?:boolean;recurrence?:string[]};
export class CalendarDeleteError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}
export async function deleteGoogleEvent(input:{id:string;etag:string;scope:'occurrence'|'series'},api:<T>(path:string,method?:string,etag?:string)=>Promise<T>){
 if(!/^[a-zA-Z0-9_-]{1,1024}$/.test(input.id)||!input.etag||input.etag.length>512||!['occurrence','series'].includes(input.scope))throw new CalendarDeleteError('Refresh Google events and choose the event again.',400);
 const path=`events/${encodeURIComponent(input.id)}`;
 const event=await api<EventMetadata>(path);
 if(event.status==='cancelled')return;
 if(event.locked)throw new CalendarDeleteError('Google has locked this event. Open it in Google Calendar.',403);
 if(event.etag!==input.etag)throw new CalendarDeleteError('This event changed in Google. Refresh and review it before deleting.',409);
 let target=path;let etag:string|undefined=event.etag;
 if(input.scope==='series'){
  if(!event.recurringEventId||!/^[a-zA-Z0-9_-]{1,1024}$/.test(event.recurringEventId))throw new CalendarDeleteError('This event is not a recurring occurrence. Refresh and try again.',409);
  target=`events/${encodeURIComponent(event.recurringEventId)}`;
  const parent=await api<EventMetadata>(target);
  if(!parent.recurrence?.length||parent.locked)throw new CalendarDeleteError('This series cannot be deleted from Mako.',409);
  etag=parent.etag;
 }
 if(!etag)throw new CalendarDeleteError('Refresh this event before deleting.',409);
 await api(`${target}?sendUpdates=all`,'DELETE',etag);
}
