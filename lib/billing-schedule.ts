// Clamp month-end dates rather than letting January 31 overflow into March.
export function nextBillingMonth(timestamp:number){
 const date=new Date(timestamp*1000),day=date.getUTCDate();
 date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(day,last));return Math.floor(date.getTime()/1000);
}
