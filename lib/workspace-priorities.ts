import type {Row} from './boards';
export function duplicateContacts(rows:Row[]){
 const groups=new Map<string,{reason:string;rows:Row[]}>();
 for(const row of rows.filter(r=>!r.archived_at)){
  const email=String(row.email||'').trim().toLowerCase();
  let phone=String(row.phone||'').replace(/\D/g,'');if(phone.length===11&&phone[0]==='1')phone=phone.slice(1);
  for(const [key,reason] of [[email?`email:${email}`:'','Same email'],[phone.length>=10?`phone:${phone}`:'','Same phone']]){
   if(!key)continue;const group=groups.get(key)||{reason,rows:[]};group.rows.push(row);groups.set(key,group);
  }
 }
 const seen=new Set<string>();return [...groups.values()].filter(g=>{const key=g.rows.map(r=>r.id).sort().join(',');if(g.rows.length<2||seen.has(key))return false;seen.add(key);return true;});
}
export function dailyFollowups(rows:Row[],today:string,owner=''){
 return rows.filter(r=>!r.archived_at&&r.followup_date&&String(r.followup_date)<=today&&(!owner||r.owner_id===owner)).sort((a,b)=>String(a.followup_date).localeCompare(String(b.followup_date))||String(a.name).localeCompare(String(b.name)));
}
export function nextFollowupDay(today:string){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
