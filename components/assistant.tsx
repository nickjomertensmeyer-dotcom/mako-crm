'use client';
import {SharkyIcon} from './sharky-icon';
export function Assistant({enabled,demo=false}:{enabled:boolean;demo?:boolean}){
return <section className="panel sharky-intro"><SharkyIcon size={110}/><p className="eyebrow">YOUR BUSINESS SIDEKICK</p><h1>Meet Fin.</h1><p className="muted">A friendly little helper for follow-ups, planning your day, and your next business question. Find Fin’s movable bubble on every workspace tab.</p><button className="primary" onClick={()=>window.dispatchEvent(new Event('mako-open-sharky'))}>Chat with Fin</button>{(demo||!enabled)&&<p className="notice">{demo?'Demo conversations use labeled sample replies. No live AI requests are sent.':'The AI provider needs to be connected before Fin can answer live questions.'}</p>}</section>;
}
