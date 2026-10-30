// Invoice payments belong to the independent business, never to Mako's billing customer.
export function connectAccountParameters(workspaceId:string,country:string){
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(workspaceId))throw new Error('Invalid workspace.');
 if(!['US','CA','GB','AU'].includes(country))throw new Error('Choose your business country before connecting Stripe.');
 return {
  identity:{country},
  dashboard:'full' as const,
  defaults:{responsibilities:{fees_collector:'stripe' as const,losses_collector:'stripe' as const}},
  configuration:{merchant:{capabilities:{card_payments:{requested:true}}}},
  metadata:{mako_workspace_id:workspaceId},
 };
}
export function payableBalance(total:number,paid:number){
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(paid)||total<0||paid<0||paid>=total)throw new Error('Invoice has no valid outstanding balance.');
 return total-paid;
}
export function connectPaymentMatches(expected:{account:string;session:string;amount:number;currency:string;live:boolean},event:{account?:string;livemode:boolean},session:{id:string;mode:string|null;payment_status:string;amount_total:number|null;currency:string|null}){
 return event.account===expected.account&&event.livemode===expected.live&&session.id===expected.session&&session.mode==='payment'&&session.payment_status==='paid'&&session.amount_total===expected.amount&&session.currency===expected.currency;
}
