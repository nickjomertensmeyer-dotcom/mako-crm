import {createHmac} from 'node:crypto';
import {calendarConfig,calendarDatabase} from '@/lib/google-calendar';
import {validFormProof} from '@/lib/lead-form';
import {boundedBody} from '@/lib/request-body';
import {emailAddress} from '@/lib/connections-model';
export async function POST(request:Request){
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});const config=calendarConfig();if(request.headers.get('origin')!==config.origin)return json({error:'Please use the website enquiry form.'},403);
 try{
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,12000)));
  if(typeof body.website==='string'&&body.website)return json({message:'Thank you. Your enquiry has been received.'});
  if(typeof body.formId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.formId)||typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id)||typeof body.proof!=='string'||!validFormProof(body.formId,body.proof,config.key.toString('hex')))return json({error:'Please wait a moment, or reload the form if it has expired.'},400);
  if(body.consent!==true||typeof body.name!=='string'||!body.name.trim()||body.name.length>120||!emailAddress(body.email)||typeof body.phone!=='string'||body.phone.length>40||typeof body.message!=='string'||body.message.length>4000)return json({error:'Check your name, email, phone, message, and contact permission.'},400);
  const address=(request.headers.get('x-forwarded-for')||'local').split(',')[0].trim(),hash=createHmac('sha256',config.key).update(`${body.formId}:${address}`).digest('hex');
  const {error}=await calendarDatabase().rpc('submit_website_lead',{form_uuid:body.formId,submission_uuid:body.id,address_key:hash,person:{name:body.name.trim(),email:body.email.trim(),phone:body.phone.trim(),message:body.message.trim()}});
  if(error)return json({error:'Your enquiry could not be accepted. Please try later or contact the business directly.'},429);
  return json({message:'Thank you. Your enquiry has been received.'});
 }catch{return json({error:'Could not submit your enquiry. Please try again.'},400);}
}
