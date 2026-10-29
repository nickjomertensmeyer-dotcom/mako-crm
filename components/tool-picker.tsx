'use client';
import {Users,Target,FileText,CalendarDays,BriefcaseBusiness,Receipt,ListChecks,UsersRound,Check,Plus} from 'lucide-react';
import {modules} from '@/lib/presets';
const tools={
  customers:{label:'Customers',description:'Manage your relationships',icon:Users},
  leads:{label:'Leads',description:'Track your sales pipeline',icon:Target},
  quotes:{label:'Quotes',description:'Build and manage quotes',icon:FileText},
  schedule:{label:'Schedule',description:'Organize appointments',icon:CalendarDays},
  jobs:{label:'Jobs',description:'Keep work moving',icon:BriefcaseBusiness},
  invoices:{label:'Invoices',description:'Invoices and recorded payments',icon:Receipt},
  tasks:{label:'Tasks',description:'Stay on top of next steps',icon:ListChecks},
  team:{label:'Team',description:'Planned workspace feature',icon:UsersRound},
};
export function ToolPicker({selected,onChange}:{selected:readonly string[];onChange:(next:string[])=>void}){
  return <div className="tool-picker" role="group" aria-label="Workspace tools">{modules.map((key,index)=>{
    const tool=tools[key],Icon=tool.icon,checked=selected.includes(key);
    return <label className={`tool-choice${checked?' is-selected':''}`} data-accent={index%3} key={key}>
      <input type="checkbox" name="modules" value={key} aria-label={key} checked={checked} onChange={event=>onChange(event.target.checked?[...selected,key]:selected.filter(value=>value!==key))}/>
      <span className="tool-choice-top" aria-hidden="true"><span className="tool-choice-icon"><Icon size={21}/></span><span className="tool-choice-check">{checked?<Check size={14}/>:<Plus size={14}/>}</span></span>
      <span className="tool-choice-name">{tool.label}{key==='team'&&<small>Soon</small>}</span><span className="tool-choice-description">{tool.description}</span>
      <span className="tool-choice-state" aria-hidden="true">{checked?'Selected':'Add to workspace'}</span>
    </label>;
  })}</div>;
}
