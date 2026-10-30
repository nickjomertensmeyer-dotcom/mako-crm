import 'server-only';
import {calendarDatabase} from './google-calendar';
import type {QbDiagnostic} from './quickbooks-http';
export async function recordQbDiagnostic(event:QbDiagnostic){
 // Never persist URLs, query strings, headers, provider payloads, credentials or customer data.
 const safe={reference:event.reference,workspace_id:event.workspaceId||null,user_id:event.userId||null,environment:event.environment,operation:event.operation.slice(0,60),method:event.method,status:event.status,intuit_tid:event.tid,code:event.code,category:event.category};
 if(event.category!=='success')console.warn('QuickBooks request failed',{reference:event.reference,environment:event.environment,operation:event.operation,status:event.status,intuit_tid:event.tid,code:event.code,category:event.category});
 const result=await calendarDatabase().from('qb_api_events').insert(safe);
 if(result.error)throw new Error('Diagnostic storage unavailable.');
}
