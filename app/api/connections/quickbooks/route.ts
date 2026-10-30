import {connectionComingSoon,quickBooksComingSoonMessage} from '@/lib/connections-model';
import {connectionContext} from '@/lib/connections';
import {qbCredentials,qbRead} from '@/lib/quickbooks';
export const runtime='nodejs';
export async function GET(request:Request){
 if(connectionComingSoon('quickbooks'))return Response.json({error:quickBooksComingSoonMessage},{status:503,headers:{'Cache-Control':'no-store'}});
 const ctx=await connectionContext();const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});if(ctx.role!=='owner')return json({error:'Only workspace owners can access connected accounting data.'},403);
 try{
  const credential=await qbCredentials(ctx.business.id,ctx.user.id),mode=new URL(request.url).searchParams.get('mode')||'Invoice';if(!['Customer','Invoice','Payment'].includes(mode))return json({error:'Choose customers, invoices, or payments.'},400);
  const data=await qbRead<{QueryResponse?:Record<string,unknown[]>}>(credential,`query?query=${encodeURIComponent(`select * from ${mode} startposition 1 maxresults 100`)}`);
  return json({environment:credential.environment,kind:mode,records:data.QueryResponse?.[mode]||[],limit:100});
 }catch(error){return json({error:error instanceof Error?error.message:'Could not read QuickBooks.'},502);}
}
