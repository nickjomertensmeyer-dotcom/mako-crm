import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
export const maxDuration=300;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;const actual=request.headers.get('authorization')||'';
 if(!expected||Buffer.byteLength(actual)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${expected}`)))return Response.json({error:'Unauthorized'},{status:401});
 if(process.env.BACKUPS_ENABLED!=='true'||!process.env.SUPABASE_SECRET_KEY||!process.env.NEXT_PUBLIC_SUPABASE_URL)return Response.json({error:'Backups not enabled'},{status:503});
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
 const {data:bucket}=await client.storage.getBucket('mako-backups');
 if(!bucket){const {error}=await client.storage.createBucket('mako-backups',{public:false,fileSizeLimit:20*1024*1024});if(error)return Response.json({error:'Backup storage unavailable'},{status:503});}
 else if(bucket.public)return Response.json({error:'Backup bucket must be private'},{status:503});
 const {data:items,error}=await client.rpc('claim_backups');if(error)return Response.json({error:'Backup queue unavailable'},{status:503});
 let completed=0,failed=0;
 for(const item of items||[]){
  try{const {data,error}=await client.rpc('backup_payload',{target:item.workspace_id});if(error)throw error;
   const bytes=new TextEncoder().encode(JSON.stringify(data));if(bytes.byteLength>20*1024*1024)throw new Error('Backup exceeds size limit');
   const {error:uploadError}=await client.storage.from('mako-backups').upload(item.object_path,bytes,{contentType:'application/json',upsert:false});if(uploadError)throw uploadError;
   const {error:saveError}=await client.from('workspace_backups').update({status:'Complete'}).eq('id',item.id);if(saveError)throw saveError;
   // Retain seven days of successful workspace snapshots, only after a new backup succeeds.
   const cutoff=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
   const {data:old}=await client.from('workspace_backups').select('id,object_path').eq('workspace_id',item.workspace_id).eq('status','Complete').lt('day',cutoff);
   const ownPaths=(old||[]).filter(b=>b.object_path.startsWith(item.workspace_id+'/'));
   if(ownPaths.length){const {error:deleteError}=await client.storage.from('mako-backups').remove(ownPaths.map(b=>b.object_path));if(!deleteError)await client.from('workspace_backups').delete().in('id',ownPaths.map(b=>b.id));}
   completed++;
  }catch{await client.from('workspace_backups').update({status:'Failed'}).eq('id',item.id);failed++;}
 }
 return Response.json({completed,failed},{headers:{'Cache-Control':'no-store'}});
}
