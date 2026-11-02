'use server';
import {identity} from '@/lib/workspace';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
export async function submitReview(_state:{error:string;success:string},form:FormData){
 const {client}=await identity();
 const name=String(form.get('display_name')||'').trim(),company=String(form.get('business_name')||'').trim(),body=String(form.get('body')||'').trim(),rating=Number(form.get('rating'));
 if(!name||name.length>80||company.length>120||body.length<20||body.length>2000||!Number.isInteger(rating)||rating<1||rating>5||form.get('consent')!=='on')return {error:'Choose a rating, add your name and 20–2,000 characters of feedback, and confirm publication permission.',success:''};
 const {error}=await client.rpc('submit_review',{public_name:name,company,stars:rating,review_body:body,permission:true});
 if(error)return {error:'Unable to submit. You need a Mako workspace account. If you just submitted, wait one minute and try again.',success:''};
 revalidatePath('/reviews');revalidatePath('/owner');
 return {error:'',success:'Thank you. Your review is private until reviewed for publication.'};
}
export async function changeReviewStatus(form:FormData){
 const {client}=await identity();const status=String(form.get('status')||'');
 const {error}=await client.rpc('set_review_status',{review_id:String(form.get('id')||''),new_status:status});
 revalidatePath('/reviews');revalidatePath('/owner');
 redirect((status==='withdrawn'?'/reviews':'/owner')+'?message='+encodeURIComponent(error?'Unable to update review.':'Review updated.'));
}
