'use client';
import {useState} from 'react';
import {ToolPicker} from './tool-picker';
import {IndustryOptions} from './industry-options';
import {recommendedTools,industryDescriptions} from '@/lib/presets';
import {ArrowRight} from 'lucide-react';
export function OnboardingForm({action,initial,pilot=false}:{action:(form:FormData)=>void|Promise<void>;pilot?:boolean;initial?:{name:string;industry:string;modules:string[]}}){
 const [industry,setIndustry]=useState(initial?.industry||'Landscaping & lawn care'),[selected,setSelected]=useState<readonly string[]>(initial?.modules||recommendedTools('Landscaping & lawn care')),[pending,setPending]=useState(false);
 return <form action={action} onSubmit={()=>setPending(true)}><label>Business name<input name="name" defaultValue={initial?.name} placeholder="Your lawn care business name" minLength={2} maxLength={100} required/></label><p className="notice"><strong>{industry==='Landscaping & lawn care'?'Your property workflow is ready.':'Your business setup.'}</strong> {industryDescriptions[industry]} You can adjust these tools later.</p><details className="workspace-details"><summary>Adjust business type or tools</summary><label>Business type<select name="industry" value={industry} onChange={e=>{setIndustry(e.target.value);setSelected(recommendedTools(e.target.value));}}><IndustryOptions/></select></label><ToolPicker selected={selected} onChange={setSelected}/></details><button className="primary" disabled={pending||!selected.length}>{pending?'Saving your workspace…':initial?'Save workspace settings':pilot?'Create my workspace':'Choose my plan and user count'}<ArrowRight size={17}/></button></form>;
}
