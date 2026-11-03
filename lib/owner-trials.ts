export type OwnerTrialRow={id:string;business:string;workspaceId:string;status:string;startsAt:number;endsAt:number;cancelAtEnd:boolean;converted:boolean};
export function trialStage(row:OwnerTrialRow,now=Date.now()/1000){
 if(row.converted)return 'Converted to paid';
 if(row.status==='trialing'&&row.endsAt>now)return row.cancelAtEnd?'Canceling trial':row.endsAt-now<=2*86400?'Ending soon':'Trial active';
 return row.status==='past_due'||row.status==='unpaid'?'Payment needed':'Trial ended';
}
export function trialMetrics(rows:OwnerTrialRow[],now=Date.now()/1000){
 const active=rows.filter(r=>r.status==='trialing'&&r.endsAt>now);
 const converted=rows.filter(r=>r.converted).length;
 const completed=rows.filter(r=>r.converted||r.status!=='trialing'||r.endsAt<=now).length;
 return {total:rows.length,active:active.length,ending:active.filter(r=>r.endsAt-now<=2*86400).length,converted,completed,conversion:completed?Math.round(converted/completed*100):null};
}
