export function emailConfirmation(hash:unknown,type:unknown){
 if(typeof hash!=='string'||!/^[a-zA-Z0-9_-]{20,256}$/.test(hash))return null;
 if(type!=='email'&&type!=='recovery'&&type!=='invite')return null;
 return {token_hash:hash,type};
}
export function confirmationDestination(type:string,pilot:boolean){
 return type==='recovery'||type==='invite'?'/reset-password':pilot?'/pilot':'/workspace';
}
