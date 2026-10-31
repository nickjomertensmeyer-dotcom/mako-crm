export type PilotActivityRow = {
 id:string;email:string;business:string|null;invited_at:string;accepted_at:string|null;ends_at:string|null;expires_at:string;revoked_at:string|null;
 excluded:boolean;verified:boolean;subscribed:boolean;last_active:string|null;last_meaningful:string|null;contact_at:string|null;work_at:string|null;progress_at:string|null;returned:boolean;activated:boolean;
};
export function pilotStage(row:PilotActivityRow){
 if(row.subscribed)return 'Subscribed';
 if(row.activated)return 'Activated';
 if(row.accepted_at||row.verified)return 'Setting up';
 return 'Not started';
}
export function pilotNeedsHelp(row:PilotActivityRow,startedAt:string,now=Date.now()){
 if(!row.accepted_at||row.excluded||row.subscribed||row.revoked_at||!row.ends_at||Date.parse(row.ends_at)<=now)return false;
 const last=Math.max(Date.parse(row.last_meaningful||row.accepted_at),Date.parse(startedAt));
 return now-last>=3*86400000;
}
export function pilotDaysLeft(endsAt:string|null,now=Date.now()){
 return endsAt?Math.max(0,Math.ceil((Date.parse(endsAt)-now)/86400000)):null;
}
