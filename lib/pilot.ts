export const PILOT_COOKIE='mako-pilot';
export const validPilotCode=(code:string)=>/^[a-f0-9]{64}$/.test(code);
export function pilotExpired(end?:string|null,now=Date.now()){return Boolean(end&&new Date(end).getTime()<=now);}
export function pilotDate(end:string){return new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeStyle:'short',timeZone:'America/Chicago'}).format(new Date(end))+' Central';}
