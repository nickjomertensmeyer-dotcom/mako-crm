import {timingSafeEqual} from 'node:crypto';
export const quickBooksScope='com.intuit.quickbooks.accounting';
export function validQuickBooksState(value:unknown,nonce:unknown,environment:string,now=Date.now()){
 if(!value||typeof value!=='object'||typeof nonce!=='string'||nonce.length<32||nonce.length>128)return false;
 const s=value as Record<string,unknown>,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(typeof s.state!=='string'||s.state.length!==nonce.length||s.environment!==environment||typeof s.expires!=='number'||!Number.isFinite(s.expires)||s.expires<=now||s.expires>now+660000||typeof s.uid!=='string'||!uuid.test(s.uid)||typeof s.wid!=='string'||!uuid.test(s.wid))return false;
 const left=Buffer.from(s.state),right=Buffer.from(nonce);return left.length===right.length&&timingSafeEqual(left,right);
}
export function quickBooksEnvironment(value:string|undefined):'sandbox'|'production'{if(value!=='sandbox'&&value!=='production')throw new Error('Set the QuickBooks environment explicitly.');return value;}
export function quickBooksRealm(value:unknown):value is string{return typeof value==='string'&&/^\d{1,30}$/.test(value);}
export function quickBooksCallback(origin:string){const url=new URL(origin);if(url.hostname==='127.0.0.1')throw new Error('For QuickBooks testing, open Mako at localhost instead of 127.0.0.1. Intuit does not allow IP callback URLs.');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='localhost'))throw new Error('Invalid QuickBooks callback origin.');return `${url.origin}/api/quickbooks/callback`;}
export function qbContact(customer:{Id?:string;DisplayName?:string;GivenName?:string;FamilyName?:string;CompanyName?:string;PrimaryEmailAddr?:{Address?:string};PrimaryPhone?:{FreeFormNumber?:string}}){
 if(!customer.Id||!/^\d{1,30}$/.test(customer.Id))return null;
 const name=(customer.DisplayName||[customer.GivenName,customer.FamilyName].filter(Boolean).join(' ')).trim().slice(0,120);if(!name)return null;
 const email=customer.PrimaryEmailAddr?.Address||'';return {externalId:customer.Id,name,email:email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:'',phone:(customer.PrimaryPhone?.FreeFormNumber||'').slice(0,40),company:(customer.CompanyName||'').slice(0,120)};
}
