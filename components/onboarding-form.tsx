'use client';
import { useState } from 'react';
import {ToolPicker} from './tool-picker';
import {IndustryOptions} from './industry-options';
import { presets,recommendedTools,industryDescriptions } from '@/lib/presets';
import { ArrowRight } from 'lucide-react';
export function OnboardingForm({ action, initial }: { action: (form: FormData) => void | Promise<void>, initial?: {name:string,industry:string,modules:string[]} }) {
  const [industry,setIndustry]=useState(initial?.industry || 'General business');
  const [selected,setSelected]=useState<readonly string[]>(initial?.modules || presets['General business']);
  const [pending,setPending]=useState(false);
  return <form action={action} onSubmit={()=>setPending(true)}><label>Business name<input name="name" defaultValue={initial?.name} placeholder="Your business name" minLength={2} maxLength={100} required /></label><label>What kind of business do you run?<select name="industry" value={industry} onChange={e=>{setIndustry(e.target.value);setSelected(recommendedTools(e.target.value));}}><IndustryOptions/></select></label><p className="industry-description">{industryDescriptions[industry]}</p><p className="preset-notice">Recommended tools are selected automatically. Customize your selection below.</p><div className="label-row"><strong>Choose your tools</strong><small>You can change these later</small></div><ToolPicker selected={selected} onChange={setSelected}/><button className="primary" disabled={pending || !selected.length}>{pending?'Saving your workspace…':initial?'Save workspace settings':'Create my workspace'}<ArrowRight size={17}/></button></form>;
}
