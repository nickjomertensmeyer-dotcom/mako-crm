'use client';
import {useState} from 'react';
import {useFormStatus} from 'react-dom';
import {recommendedTools} from '@/lib/presets';
import {ArrowRight,Trees,BriefcaseBusiness} from 'lucide-react';
const choices=[{name:'Landscaping & lawn care',Icon:Trees,description:'Everything in General business, plus properties, estimates, scheduled jobs, and recurring visits.'},{name:'General business',Icon:BriefcaseBusiness,description:'A simple start with customers, leads, tasks, and invoices.'}] as const;
function Continue({initial,pilot}:{initial:boolean;pilot:boolean}){const {pending}=useFormStatus();return <button className="primary" type="submit" disabled={pending}>{pending?'Saving your workspace…':initial?'Save workspace setup':pilot?'Create my workspace':'Continue to plans'}<ArrowRight size={17}/></button>;}
export function OnboardingForm({action,initial,pilot=false}:{action:(form:FormData)=>void|Promise<void>;pilot?:boolean;initial?:{name:string;industry:string;modules:string[]}}){
 const [industry,setIndustry]=useState(initial?.industry||'Landscaping & lawn care');
 const selected=initial&&industry===initial.industry?initial.modules:recommendedTools(industry);
 const legacy=Boolean(initial&&!choices.some(c=>c.name===initial.industry));
 return <form action={action}><fieldset className="setup-options"><legend>Choose your starting point</legend>{choices.map(({name,Icon,description})=><label className={`setup-choice${industry===name?' selected':''}`} key={name}><input type="radio" name="industry" value={name} checked={industry===name} onChange={()=>setIndustry(name)}/><Icon size={24} aria-hidden="true"/><strong>{name}</strong><span>{description}</span></label>)}{legacy&&<label className={`setup-choice${industry===initial!.industry?' selected':''}`}><input type="radio" name="industry" value={initial!.industry} checked={industry===initial!.industry} onChange={()=>setIndustry(initial!.industry)}/><strong>Keep my current setup</strong><span>{initial!.industry}. Your current tools stay selected.</span></label>}</fieldset><label>Business name<input name="name" defaultValue={initial?.name} placeholder="Your business name" minLength={2} maxLength={100} autoComplete="organization" required/></label>{selected.map(tool=><input key={tool} name="modules" type="hidden" value={tool}/>)}<p className="small-copy muted">{initial&&industry!==initial.industry?'Changing the setup updates your available tools. Existing records are retained.':'You can adjust your tools later in Business settings.'}</p><Continue initial={Boolean(initial)} pilot={pilot}/></form>;
}
