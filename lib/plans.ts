export const plans=[
 {id:'starter',name:'Starter',monthlyCents:4900,includedUsers:1,description:'For an owner running the route.'},
 {id:'pro',name:'Pro',monthlyCents:10000,includedUsers:5,description:'For a small lawn care team.'},
 {id:'team',name:'Team',monthlyCents:17900,includedUsers:12,description:'For a growing landscaping operation.'},
] as const;
export type PlanId=typeof plans[number]['id'];
export const EXTRA_USER_CENTS=1500;
export const MAX_USERS=100;
export function planById(id:unknown){return plans.find(p=>p.id===id);}
export function userQuantity(value:unknown,minimum=1){
 const text=String(value??'');if(!/^\d+$/.test(text))throw Error('Choose a whole number of users.');
 const n=Number(text);if(!Number.isSafeInteger(n)||n<minimum||n>MAX_USERS)throw Error(`Choose ${minimum}–${MAX_USERS} users.`);return n;
}
export function monthlyTotal(id:PlanId,users:number){const p=planById(id)!;userQuantity(users,p.includedUsers);return p.monthlyCents+Math.max(0,users-p.includedUsers)*EXTRA_USER_CENTS;}
export function lowestTotalPlan(users:number){userQuantity(users);return [...plans].sort((a,b)=>monthlyTotal(a.id,Math.max(users,a.includedUsers))-monthlyTotal(b.id,Math.max(users,b.includedUsers)))[0];}
export function planPriceId(id:PlanId,env:Record<string,string|undefined>=process.env){return env[`STRIPE_${id.toUpperCase()}_PRICE_ID`];}
export function tierPriceIds(env:Record<string,string|undefined>=process.env){return plans.map(p=>planPriceId(p.id,env)).filter((s):s is string=>Boolean(s));}
// The first tier is a flat subscription fee. Only users above the included count cost extra.
export function validPlanPrice(price:{active?:boolean;livemode?:boolean;currency?:string;type?:string;billing_scheme?:string;tiers_mode?:string|null;recurring?:{interval:string;interval_count:number}|null;tiers?:{up_to:number|null;flat_amount:number|null;unit_amount:number|null}[]},id:PlanId,live:boolean){
 const p=planById(id)!;const t=price.tiers;
 return price.active===true&&price.livemode===live&&price.currency==='usd'&&price.type==='recurring'&&price.billing_scheme==='tiered'&&price.tiers_mode==='graduated'&&price.recurring?.interval==='month'&&price.recurring.interval_count===1&&t?.length===2&&t[0].up_to===p.includedUsers&&t[0].flat_amount===p.monthlyCents&&(t[0].unit_amount||0)===0&&t[1].up_to===null&&(t[1].flat_amount||0)===0&&t[1].unit_amount===EXTRA_USER_CENTS;
}
export function subscriptionCapacity(sub:{items:{data:{price:{id:string};quantity?:number|null}[]}}|undefined,env:Record<string,string|undefined>=process.env){
 if(!sub)return null;
 const matches=sub.items.data.filter(i=>tierPriceIds(env).includes(i.price.id));
 if(matches.length!==1||sub.items.data.length!==1)return null;
 const item=matches[0],plan=plans.find(p=>planPriceId(p.id,env)===item.price.id)!;
 try{return {tier:plan.id,users:userQuantity(item.quantity,plan.includedUsers),priceId:item.price.id};}catch{return null;}
}
