import Link from 'next/link';
import {pilotDate,pilotExpired} from '@/lib/pilot';
export function PilotBanner({endsAt}:{endsAt?:string|null}){
 if(!endsAt)return null;
 return <aside className="notice" aria-label="Pro pilot access"><strong>{pilotExpired(endsAt)?'Your Pro pilot has ended.':'Your 14-day Pro pilot is active.'}</strong><p>Access ends {pilotDate(endsAt)}. No card is charged automatically. Your records are retained.</p><Link href="/workspace?view=plan">Subscribe to Pro — $100/month</Link><p className="small-copy">Subscribing starts paid access and billing immediately.</p></aside>;
}
