import {IndustryShell} from '@/components/industry-shell';
import {IndustryLinks} from '@/components/industry-links';
import {publicMetadata} from '@/lib/public-metadata';
import {ArrowUpRight} from 'lucide-react';
export const metadata=publicMetadata('CRM Workflows for Service Businesses | Mako CRM','Explore practical CRM workflows for detailing, cleaning, lawn care, landscaping, and tree service businesses. See how Mako connects customers, quotes, jobs, tasks, and invoices.','/for');
export default function BusinessWorkflows(){return <IndustryShell>
 <nav className="industry-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Business workflows</span></nav>
 <section className="industry-hub-hero"><p className="eyebrow">YOUR BUSINESS. YOUR WAY TO WORK.</p><h1>A clearer workflow<br/>for the work you do.</h1><p>See what to record, how to plan the next step, and which Mako tools fit a detailing, cleaning, lawn care, landscaping, or tree service business.</p><a className="primary" href="/preview">Try the demo <ArrowUpRight size={17}/></a><p className="industry-small">Shared workspace demo · Fictional records · No signup needed</p></section>
 <section className="industry-hub-choices" aria-label="Choose a business workflow"><IndustryLinks/></section>
 <section className="industry-fit"><div><p className="eyebrow">ONE FLEXIBLE WORKSPACE</p><h2>Choose your tools.<br/>Start with one real task.</h2></div><div><p>Mako Pro is the same connected CRM across these workflows. Your business setup helps you choose relevant tools; each guide shows a practical way to use them.</p><p>Run another kind of service business? Start with General business and enable the customer, lead, task, and invoicing tools that fit your process.</p><a className="home-text-link" href="/preview?view=business-settings">Explore business settings <ArrowUpRight size={17}/></a></div></section>
 <section className="home-final"><p className="eyebrow">STAY SHARP. MOVE FASTER.</p><h2>See where Mako fits<br/>in your next workday.</h2><p>Pro is $100 USD per month, plus applicable tax. No onboarding fee.</p><a className="primary" href="/preview">Try the demo <ArrowUpRight size={17}/></a><a className="industry-final-link" href="/#pricing">Compare Pro, templates, and Custom</a></section>
 </IndustryShell>;}
