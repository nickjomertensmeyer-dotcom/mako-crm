import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
export const maxDuration=300;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET,actual=request.headers.get('authorization')||'';
 if(!secret||Buffer.byteLength(actual)!==Buffer.byteLength(`Bearer ${secret}`)||!timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${secret}`)))return Response.json({error:'Unauthorized'},{status:401});
 const key=process.env.SUPABASE_SECRET_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!key||!url)return Response.json({error:'Workflow worker not configured'},{status:503});
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.rpc('run_scheduled_board_rules');
 if(error)return Response.json({error:'Unable to execute workflow rules'},{status:503});
 return Response.json({recordsChecked:data},{headers:{'Cache-Control':'no-store'}});
}
