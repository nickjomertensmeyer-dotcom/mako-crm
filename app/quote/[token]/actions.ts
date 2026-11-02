'use server';
import {redirect} from 'next/navigation';
import {quoteHash,salesDatabase} from '@/lib/quote-sharing';
export async function respondQuote(token:string,form:FormData){const hash=quoteHash(token),answer=String(form.get('decision')),signer=String(form.get('name')||'').trim();if(!hash||!['Accepted','Declined'].includes(answer)||signer.length<2||signer.length>120||form.get('confirm')!=='on')redirect(`/quote/${encodeURIComponent(token)}?error=1`);const {error}=await salesDatabase().rpc('respond_to_quote',{secret_hash:hash,answer,signer});redirect(`/quote/${token}?${error?'error=1':'saved=1'}`);}
