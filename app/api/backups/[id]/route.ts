import {workspace} from '@/lib/workspace';
import {createClient} from '@supabase/supabase-js';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {client,business,role}=await workspace();if(role!=='owner')return Response.json({error:'Owner access required'},{status:403});
 const {id}=await params;const {data}=await client.from('workspace_backups').select('*').eq('id',id).eq('workspace_id',business.id).eq('status','Complete').maybeSingle();
 if(!data||!data.object_path.startsWith(business.id+'/'))return Response.json({error:'Backup not found'},{status:404});
 if(!process.env.SUPABASE_SECRET_KEY)return Response.json({error:'Backup downloads are not connected'},{status:503});
 const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
 const {data:file,error}=await service.storage.from('mako-backups').download(data.object_path);if(error||!file)return Response.json({error:'Backup unavailable'},{status:503});
 return new Response(file,{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="mako-backup-${data.day}.json"`,'Cache-Control':'private, no-store'}});
}
