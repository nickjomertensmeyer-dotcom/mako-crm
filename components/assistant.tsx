'use client';
import {SharkyIcon} from './sharky-icon';
export function Assistant({demo=false}:{enabled:boolean;demo?:boolean}){
return <section className="panel sharky-intro"><SharkyIcon size={110}/><p className="eyebrow">YOUR BUSINESS SIDEKICK</p><h1>Meet Fin.</h1><p className="muted">A friendly little helper for follow-ups, planning your day, and your next business question. Find Fin’s movable bubble on every workspace tab.</p><button className="primary" onClick={()=>window.dispatchEvent(new Event('mako-open-sharky'))}>Chat with Fin</button><p className="notice">Free prepared help and templates. Advanced AI coming soon. {demo?'Demo changes are temporary.':'Fin does not read or change your records.'}</p></section>;
}
