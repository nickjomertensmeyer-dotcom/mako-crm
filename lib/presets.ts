export const modules = ['customers', 'leads', 'quotes', 'schedule', 'jobs', 'invoices', 'tasks', 'team','assets','recurring','booking','projects','inventory'] as const;
type Module = typeof modules[number];
type BusinessType = {name:string;group:string;description:string;tools:readonly Module[]};
const field:readonly Module[]=['customers','leads','quotes','schedule','jobs','invoices','tasks'];
const service:readonly Module[]=['customers','quotes','schedule','jobs','invoices','tasks'];
const project:readonly Module[]=['customers','leads','quotes','jobs','invoices','tasks'];
const appointments:readonly Module[]=['customers','schedule','invoices','tasks'];
export const businessTypes:readonly BusinessType[]=[
 {name:'General business',group:'General',description:'A flexible starting point for relationships, sales follow-ups, and invoices.',tools:['customers','leads','tasks','invoices']},
 {name:'Mobile detailing',group:'Field services',description:'Customer details, service quotes, appointments, jobs, and invoices.',tools:service},
 {name:'Tree service',group:'Field services',description:'Track inquiries, quote work, schedule jobs, and record invoices.',tools:field},
 {name:'Cleaning',group:'Field services',description:'Organize customers, quotes, scheduled visits, jobs, and invoices.',tools:service},
 {name:'Landscaping & lawn care',group:'Field services',description:'Keep property-service inquiries, quotes, visits, and work organized.',tools:field},
 {name:'Pressure washing',group:'Field services',description:'Move service inquiries through quotes, scheduled work, and invoicing.',tools:field},
 {name:'Pest control',group:'Field services',description:'Manage customers, service visits, work notes, and invoices.',tools:service},
 {name:'HVAC',group:'Trades & repairs',description:'Coordinate service inquiries, estimates, appointments, and repair jobs.',tools:field},
 {name:'Plumbing',group:'Trades & repairs',description:'Track service requests, quotes, scheduled work, and invoices.',tools:field},
 {name:'Electrical',group:'Trades & repairs',description:'Organize customer inquiries, estimates, work dates, and invoices.',tools:field},
 {name:'General contracting',group:'Trades & repairs',description:'Track leads, proposals, work, appointments, and payment receipts.',tools:field},
 {name:'Painting',group:'Trades & repairs',description:'Follow up on estimates and coordinate scheduled painting work.',tools:field},
 {name:'Appliance repair',group:'Trades & repairs',description:'Manage customer details, repair appointments, jobs, and invoices.',tools:service},
 {name:'Auto repair',group:'Trades & repairs',description:'Organize customers, estimates, repair appointments, and invoices.',tools:service},
 {name:'Consulting',group:'Professional services',description:'Manage prospects, proposals, meetings, projects, and invoices.',tools:field},
 {name:'Marketing & creative agency',group:'Professional services',description:'Connect prospects, proposals, client work, tasks, and invoices.',tools:project},
 {name:'IT services',group:'Professional services',description:'Track business inquiries, service quotes, appointments, and client work.',tools:field},
 {name:'Photography & videography',group:'Professional services',description:'Organize inquiries, quotes, shoot dates, project work, and invoices.',tools:field},
 {name:'Event planning',group:'Events & appointments',description:'Track event inquiries, proposals, dates, preparation tasks, and invoices.',tools:field},
 {name:'Catering',group:'Events & appointments',description:'Coordinate client inquiries, event quotes, dates, work, and invoices.',tools:field},
 {name:'Beauty & wellness',group:'Events & appointments',description:'Manage customer relationships, appointments, tasks, and invoices.',tools:appointments},
 {name:'Personal training',group:'Events & appointments',description:'Organize clients, session dates, follow-up tasks, and invoices.',tools:appointments},
 {name:'Tutoring & coaching',group:'Events & appointments',description:'Keep client details, sessions, tasks, and invoices in one workspace.',tools:appointments},
 {name:'Pet services',group:'Events & appointments',description:'Organize customer relationships, service appointments, and invoices.',tools:appointments},
 {name:'Real estate',group:'Property & commerce',description:'Track relationships, opportunities, appointments, and follow-up tasks.',tools:['customers','leads','schedule','tasks']},
 {name:'Property management',group:'Property & commerce',description:'Coordinate contacts, maintenance quotes, appointments, work, and invoices.',tools:service},
 {name:'Retail & wholesale',group:'Property & commerce',description:'Track customer relationships, sales quotes, tasks, and invoices. Includes inventory and purchasing; POS is not included.',tools:['customers','leads','quotes','invoices','tasks']},
 {name:'Other',group:'General',description:'Start with customers and tasks, then choose the tools that fit your business.',tools:['customers','tasks']},
];
export const industries=businessTypes.map(type=>type.name);
export const industryGroups=[...new Set(businessTypes.map(type=>type.group))];
export const presets:Readonly<Record<string,readonly string[]>>=Object.fromEntries(businessTypes.map(type=>[type.name,type.tools]));
export const industryDescriptions:Readonly<Record<string,string>>=Object.fromEntries(businessTypes.map(type=>[type.name,type.description]));
export function recommendedTools(industry:string):string[]{const base=[...(presets[industry]||presets['General business'])];const extra:string[]=[];if(['Mobile detailing','Tree service','Landscaping & lawn care','Pressure washing','Pest control','HVAC','Plumbing','Electrical','Appliance repair','Auto repair','Pet services','Property management','Real estate'].includes(industry))extra.push('assets');if(['Cleaning','Landscaping & lawn care','Pest control','HVAC','Property management'].includes(industry))extra.push('recurring');if(['Beauty & wellness','Personal training','Tutoring & coaching','Pet services','Photography & videography'].includes(industry))extra.push('booking');if(['Consulting','Marketing & creative agency','IT services','General contracting','Painting','Event planning'].includes(industry))extra.push('projects');if(['Retail & wholesale','Auto repair','Appliance repair','Catering'].includes(industry))extra.push('inventory');return [...base,...extra];}
