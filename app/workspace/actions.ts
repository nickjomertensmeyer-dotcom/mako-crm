'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { workspace } from '@/lib/workspace';
function fail(view:string) { redirect(`/workspace?view=${view}&message=Unable+to+save.+Check+your+details+and+workspace+access.`); }
export async function addContact(form:FormData){
 const {client,business}=await workspace(); const name=String(form.get('name')||'').trim();
 if(name.length<1||name.length>120) fail('customers');
 const {error}=await client.from('contacts').insert({workspace_id:business.id,name,email:String(form.get('email')||'').trim(),phone:String(form.get('phone')||'').trim(),company:String(form.get('company')||'').trim(),stage:form.get('stage')==='Lead'?'Lead':'Customer'});
 if(error) fail('customers'); revalidatePath('/workspace');redirect('/workspace?view=customers');
}
export async function addTask(form:FormData){
 const {client,business}=await workspace();const title=String(form.get('title')||'').trim();const due=String(form.get('due_date')||'');
 if(!title||title.length>200|| (due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))) fail('tasks');
 const {error}=await client.from('tasks').insert({workspace_id:business.id,title,due_date:due||null});
 if(error) fail('tasks');revalidatePath('/workspace');redirect('/workspace?view=tasks');
}
export async function toggleTask(form:FormData){
 const {client,business}=await workspace();
 const {error}=await client.from('tasks').update({completed:form.get('completed')==='true'}).eq('workspace_id',business.id).eq('id',String(form.get('id')));
 if(error) fail('tasks');revalidatePath('/workspace');
}
