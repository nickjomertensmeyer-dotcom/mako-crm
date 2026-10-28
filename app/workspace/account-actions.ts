'use server';
import {supabase} from '@/lib/supabase/server';
import {accountSettings, validatePreferences, type AccountSettings} from '@/lib/account';
import {workspace} from '@/lib/workspace';
import {industries,modules} from '@/lib/presets';
import {revalidatePath} from 'next/cache';
export async function saveBusinessSettings(form:FormData):Promise<{error?:string}> {
  const {client,business,role}=await workspace();
  if(role!=='owner')return {error:'Only the workspace owner can change business settings.'};
  const name=String(form.get('name')||'').trim(),industry=String(form.get('industry')||'');
  const selected=[...new Set(form.getAll('modules').map(String))];
  if(name.length<2||name.length>100||!(industries as readonly string[]).includes(industry)||!selected.length||selected.some(value=>!(modules as readonly string[]).includes(value)))return {error:'Check the business details and choose at least one valid tool.'};
  const {error}=await client.rpc('configure_workspace',{target:business.id,business_name:name,business_industry:industry,selected_modules:selected});
  if(error)return {error:'Unable to save business settings. Please try again.'};
  revalidatePath('/workspace');return {};
}
export async function saveAccountSettings(form: FormData): Promise<{settings?:AccountSettings; error?:string}> {
  const client=await supabase();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return {error:'Please sign in again to save your settings.'};
  let uploaded='';
  try {
    let metadata:Record<string,unknown>;
    if(form.get('section')==='appearance')metadata=validatePreferences(form);
    else if(form.get('section')==='profile') {
      const name=String(form.get('name')||'').trim();
      if(!name||name.length>80)throw new Error('Enter a display name between 1 and 80 characters.');
      metadata={display_name:name};
      const photo=form.get('photo');
      if(photo instanceof File&&photo.size) {
        if(photo.size>250000||photo.type!=='image/webp')throw new Error('Please choose a smaller PNG, JPEG, or WebP photo.');
        const bytes=Buffer.from(await photo.arrayBuffer());
        if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('The photo format could not be verified.');
        uploaded=`${user.id}/${crypto.randomUUID()}.webp`;
        const {error:uploadError}=await client.storage.from('profile-photos').upload(uploaded,bytes,{contentType:'image/webp',upsert:false});
        if(uploadError)throw new Error('Photo upload is unavailable. Mako needs to check profile photo storage. Your settings were not changed.');
        metadata.mako_avatar=uploaded;
      }else if(form.get('removePhoto')==='on')metadata.mako_avatar='';
    }else throw new Error('Unknown settings section.');
    const {data,error:saveError}=await client.auth.updateUser({data:metadata});
    if(saveError||!data.user)throw new Error('Your settings could not be saved. Please try again.');
    const old=user.user_metadata.mako_avatar;
    if('mako_avatar' in metadata&&typeof old==='string'&&old.startsWith(`${user.id}/`)&&old!==metadata.mako_avatar)await client.storage.from('profile-photos').remove([old]);
    return {settings:accountSettings(data.user.user_metadata,data.user.email)};
  }catch(problem){
    if(uploaded)await client.storage.from('profile-photos').remove([uploaded]);
    return {error:problem instanceof Error?problem.message:'Unable to save settings.'};
  }
}
