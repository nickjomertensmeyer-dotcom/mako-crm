import {merchantContext,merchantOnboarding} from '@/lib/stripe-connect';
import {billingOrigin} from '@/lib/billing';
export async function GET(){const ctx=await merchantContext();try{return Response.redirect(await merchantOnboarding(ctx.business.id),303);}catch{return Response.redirect(`${billingOrigin()}/workspace?view=connections&message=Please%20retry%20Stripe%20setup%20from%20Connections.`,303);}}
