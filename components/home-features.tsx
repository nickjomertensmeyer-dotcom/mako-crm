import {CalendarDays,Camera,CreditCard,FileText,Repeat,Users} from 'lucide-react';
const features=[
 {Icon:Users,title:'Customers and properties',text:'Names, contact details, property notes, access instructions and every related job in one record.',tone:'blue'},
 {Icon:FileText,title:'Quotes and invoices',text:'Branded quotes that turn into invoices, with your logo and saved services so pricing stays consistent.',tone:'violet'},
 {Icon:CalendarDays,title:'Scheduling that matches the work',text:'Calendar and agenda views for appointments and jobs, so your crew knows what is booked.',tone:'cyan'},
 {Icon:Camera,title:'Checklists and photos',text:'Keep job notes, checklists and before-and-after photos with the work they belong to.',tone:'cyan'},
 {Icon:CreditCard,title:'Deposits and payment links',text:'Connect your own Stripe account to send deposit and invoice payment links. Money goes to your business.',tone:'blue'},
 {Icon:Repeat,title:'Recurring maintenance',text:'Plan the next visit while you are finishing this one, so repeat customers do not slip away.',tone:'violet'},
];
export function HomeFeatures(){
 return <section id="features" className="home-section home-features" aria-labelledby="features-heading">
  <div className="section-intro"><p className="eyebrow">EVERYTHING IN ONE PLACE</p><h2 id="features-heading">The whole job.<br/>One workspace.</h2><p>Every plan includes the full toolkit. Pick the team size that fits, not a feature list.</p></div>
  <div className="feature-grid">{features.map(({Icon,title,text,tone})=><article key={title} className={'feature-card feature-'+tone}><span className="feature-icon"><Icon size={22}/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
 </section>;
}
