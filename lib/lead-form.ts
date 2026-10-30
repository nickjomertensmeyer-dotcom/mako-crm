import {createHmac,timingSafeEqual} from 'node:crypto';
export function formProof(id:string,key:string,issued=Date.now()){return `${issued}.${createHmac('sha256',key).update(`${id}:${issued}`).digest('hex')}`;}
export function validFormProof(id:string,proof:string,key:string,now=Date.now()){
 if(!/^\d{13}\.[a-f0-9]{64}$/.test(proof))return false;const issued=Number(proof.split('.')[0]),expected=formProof(id,key,issued);return now-issued>=2000&&now-issued<3600000&&expected.length===proof.length&&timingSafeEqual(Buffer.from(expected),Buffer.from(proof));
}
