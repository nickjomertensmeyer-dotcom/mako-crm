import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qbRequestJson,QbHttpError,qbDiscoveryUrl,validateQbDiscovery} from '../lib/quickbooks-http.ts';
const ctx={environment:'sandbox',operation:'accounting.create.invoice',workspaceId:'workspace',userId:'owner'};
const discovery={authorization_endpoint:'https://appcenter.intuit.com/connect/oauth2',token_endpoint:'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',revocation_endpoint:'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'};
test('discovery separates environments and rejects credential exfiltration endpoints',()=>{
 assert.match(qbDiscoveryUrl('sandbox'),/openid_sandbox_configuration$/);assert.match(qbDiscoveryUrl('production'),/openid_configuration$/);
 assert.equal(validateQbDiscovery(discovery).token,discovery.token_endpoint);
 for(const endpoint of ['http://oauth.platform.intuit.com/token','https://evil.example/token','https://oauth.platform.intuit.com.evil.example/token','https://user:password@oauth.platform.intuit.com/token','https://oauth.platform.intuit.com:444/token','https://oauth.platform.intuit.com/token?leak=yes'])assert.throws(()=>validateQbDiscovery({...discovery,token_endpoint:endpoint}));
 assert.throws(()=>validateQbDiscovery({}));
});
test('provider validation, syntax, authorization, grant, rate-limit and outage errors are safe and diagnosable',async()=>{
 for(const [status,body,category,code] of [[400,{Fault:{Error:[{code:'2010',Detail:'PRIVATE CUSTOMER DATA'}]}},'validation','2010'],[400,{Fault:{Error:[{code:'4000',Message:'PRIVATE SQL'}]}},'validation','4000'],[401,{error:'invalid_grant'},'authorization','invalid_grant'],[403,{},'authorization',''],[429,{},'rate_limit',''],[503,{},'provider','']]){
  const events=[];let calls=0;const fetcher=async()=>{calls++;return Response.json(body,{status,headers:{intuit_tid:'fixture-tid-123'}});};
  await assert.rejects(qbRequestJson('https://sandbox-quickbooks.api.intuit.com/test',{method:'POST',headers:{Authorization:'Bearer SECRET'},body:'PRIVATE INVOICE'},ctx,async e=>events.push(e),fetcher),error=>{assert.ok(error instanceof QbHttpError);assert.equal(error.status,status);assert.equal(error.tid,'fixture-tid-123');assert.equal(error.category,category);assert.match(error.message,/Support reference:/);assert.doesNotMatch(error.message,/PRIVATE|SECRET/);return true;});
  assert.equal(calls,1,'writes and token failures are never blindly retried');assert.equal(events.length,1);assert.equal(events[0].code,code);assert.equal(events[0].status,status);assert.equal(events[0].tid,'fixture-tid-123');assert.doesNotMatch(JSON.stringify(events),/PRIVATE|SECRET|Authorization|https:\/\//);
 }
});
test('uncertain network delivery, malformed JSON and incomplete payloads are held with support references',async()=>{
 for(const fetcher of [async()=>{throw new Error('SECRET transport URL');},async()=>new Response('PRIVATE invalid HTML',{status:200,headers:{intuit_tid:'fixture'}}),async()=>Response.json({})]){
  const events=[];await assert.rejects(qbRequestJson('https://provider.example',{method:'POST'},ctx,async e=>events.push(e),fetcher,body=>Boolean(body?.expected)),QbHttpError);assert.equal(events.length,1);assert.ok(['network','invalid_response'].includes(events[0].category));assert.doesNotMatch(JSON.stringify(events),/SECRET|PRIVATE/);
 }
});
test('successful responses retain Intuit support IDs and observer failures do not repeat a write',async()=>{
 const events=[];let options;const result=await qbRequestJson('https://provider.example',{method:'GET'},ctx,async e=>events.push(e),async(_url,init)=>{options=init;return Response.json({Invoice:{Id:'test'}},{headers:{intuit_tid:'success-tid'}});});assert.equal(result.Invoice.Id,'test');assert.equal(events[0].category,'success');assert.equal(events[0].tid,'success-tid');assert.equal(options.redirect,'error');
 let calls=0;const old=console.warn;const warnings=[];console.warn=(...args)=>warnings.push(args);try{await qbRequestJson('https://provider.example',{method:'POST'},ctx,async()=>{throw new Error('SECRET storage error');},async()=>{calls++;return Response.json({ok:true});});}finally{console.warn=old;}assert.equal(calls,1);assert.equal(warnings.length,1);assert.doesNotMatch(JSON.stringify(warnings),/SECRET/);
});
