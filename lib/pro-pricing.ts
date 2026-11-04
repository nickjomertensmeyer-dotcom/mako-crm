import {tierPriceIds} from './plans.ts';
export const PRO_MONTHLY_CENTS = 10000;
// Explicitly trusted previous price IDs keep existing subscriptions entitled.
export function proPriceIds(current=process.env.STRIPE_PRO_PRICE_ID,legacy=process.env.STRIPE_LEGACY_PRO_PRICE_IDS){
 return [...new Set([current,...(legacy||'').split(','),...tierPriceIds()].map(id=>id?.trim()).filter((id):id is string=>Boolean(id)))];
}
