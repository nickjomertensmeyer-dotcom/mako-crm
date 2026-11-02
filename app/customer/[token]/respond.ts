'use server';
import {redirect} from 'next/navigation';
import {quoteHash,salesDatabase} from '@/lib/quote-sharing';
export async function respondPortalQuote(token:string,item:string,form:FormData){const hash=quoteHash(token),answer=String(form.get('decision')),signer=String(form.get('name')||'').trim();if(!hash||!/^[0-9a-f-]{36}$/i.test(item)||!['Accepted','Declined'].includes(answer)||signer.length<2||signer.length>120||form.get('confirm')!=='on')redirect(`/customer/${encodeURIComponent(token)}?error=1`);const {error}=await salesDatabase().rpc('portal_quote_decision',{secret_hash:hash,item,answer,signer});redirect(`/customer/${token}?${error?'error=1':'saved=1'}`);}
