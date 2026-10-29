'use client';
import Link from 'next/link';
import {LayoutDashboard,Users,Target,FileText,CalendarDays,BriefcaseBusiness,ListChecks,Mail} from 'lucide-react';
import {AssetIcon,RecurringIcon,BookingIcon,ProjectIcon,InventoryIcon} from './tool-icons';
import {useBusinessIdentity} from './business-identity';
import {SharkyLaunchButton} from './sharky-assistant';
import type {Business} from './dashboard';
const links=[['customers','Customers',Users],['leads','Leads',Target],['quotes','Quotes',FileText],['schedule','Schedule',CalendarDays],['jobs','Jobs',BriefcaseBusiness],['invoices','Invoices',FileText],['tasks','Tasks',ListChecks],['assets','Service assets',AssetIcon],['recurring','Recurring work',RecurringIcon],['booking','Online booking',BookingIcon],['projects','Projects & costs',ProjectIcon],['inventory','Inventory',InventoryIcon],['team','Team',Users]] as const;
const groups=[['Sales',['customers','leads','quotes']],['Work',['tasks','jobs','schedule','assets','recurring','booking','projects','inventory','team']],['Billing',['invoices']]] as const;
export function WorkspaceNavigation({business,demo=false,current}:{business:Business;demo?:boolean;current:string}){
  const configured=useBusinessIdentity(business,demo),base=demo?'/preview':'/workspace';
  return <nav aria-label="Workspace navigation"><Link className={current==='overview'?'active':''} aria-current={current==='overview'?'page':undefined} href={base}><LayoutDashboard size={19}/>Overview</Link>{groups.map(([section,keys])=>{
    const visible=links.filter(([key])=>(keys as readonly string[]).includes(key)&&configured.modules.includes(key));
    return visible.length?<div className="nav-group" key={section}><p className="nav-section">{section}</p>{visible.map(([key,label,Icon])=><Link key={key} className={current===key?'active':''} aria-current={current===key?'page':undefined} href={`${base}?view=${key}`}><Icon size={19}/>{label}{key==='team'&&<small className="soon">Soon</small>}</Link>)}</div>:null;
  })}{configured.modules.some(key=>key==='customers'||key==='leads')&&<Link className={current==='followups'?'active':''} href={`${base}?view=followups`}><Mail size={19}/>Follow-ups</Link>}<SharkyLaunchButton/></nav>;
}
