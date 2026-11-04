import {ArrowUpRight,CarFront,Sparkles,Sprout} from 'lucide-react';
import {industryPages,industryPath} from '@/lib/industry-pages';
import './industry-pages.css';
export const industryIcons={car:CarFront,cleaning:Sparkles,lawn:Sprout};
export function IndustryLinks({exclude}:{exclude?:string}){
 return <nav className="industry-links" aria-label="Business CRM guides">{industryPages.filter(page=>page.slug!==exclude).map(page=>{const Icon=industryIcons[page.icon];return <a className={`industry-link industry-${page.icon}`} key={page.slug} href={industryPath(page.slug)}><span className="industry-link-icon"><Icon size={24}/></span><h3>{page.name}</h3><p>{page.slug==='detailing'?'Vehicle notes, service quotes, and the next booking.':page.slug==='cleaning'?'Property preferences, visit checklists, and clear billing.':page.slug==='landscaping'?'Site visits, estimates, crews, and invoices.':page.slug==='tree-service'?'Estimates, job dates, and invoices for every tree job.':'Property inquiries, estimates, and planned work.'}</p><span>See the workflow <ArrowUpRight size={17}/></span></a>;})}</nav>;
}
