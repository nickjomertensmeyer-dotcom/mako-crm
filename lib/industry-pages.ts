export type IndustryPage = {
 slug:string;name:string;shortName:string;icon:'car'|'cleaning'|'lawn';preset:string;
 title:string;description:string;headline:string;intro:string;
 example:{customer:string;work:string;status:string;notes:string[]};
 problem:{heading:string;body:string};
 steps:{title:string;body:string;view:string;action:string}[];
 intake:{label:string;reason:string}[];
 checklist:string[];setup:string[];
 image:'customers'|'tasks'|'leads';imageAlt:string;
 faqs:{question:string;answer:string}[];
};
export const industryPages:IndustryPage[]=[
 {
  slug:'detailing',name:'Auto detailing businesses',shortName:'Detailing',icon:'car',preset:'Mobile detailing',
  title:'Auto Detailing CRM for Customers, Quotes & Jobs | Mako CRM',
  description:'Organize detailing customers, vehicle notes, service quotes, appointments, and invoices in Mako CRM. Try the free demo. Pro is $100/month with no onboarding fee.',
  headline:'Your next detail starts with the right details.',
  intro:'A CRM for mobile detailers and detailing shops that want customer requests, vehicle information, quotes, and booked work in one place.',
  example:{customer:'Jordan Ellis',work:'Interior detail · midsize SUV',status:'Ready to quote',notes:['Dog hair on rear seats','Mobile visit: customer provides parking','Confirm service scope before booking']},
  problem:{heading:'The useful part of a customer history is what you remember next time.',body:'A message asking “How much for my car?” rarely contains everything needed for a quote. Save the request with the customer, record the condition and service scope, and keep the next follow-up visible. When that customer returns, the previous notes give you a starting point instead of another search through messages.'},
  steps:[
   {title:'Capture the request before quoting',body:'Create a lead with contact details and note the vehicle, requested service, and concerns such as pet hair or stained upholstery. Add a task to confirm anything missing before you promise a price.',view:'leads',action:'Explore the lead board'},
   {title:'Make the service scope clear',body:'Prepare a quote with separate service lines and notes about what is included. An interior clean and a paint-correction job need different expectations; record the agreed work before scheduling it.',view:'quotes',action:'Explore quotes'},
   {title:'Keep the booking and job notes together',body:'Schedule the appointment, link the customer to the job, and use a checklist for the agreed work. Record changes in the job notes so the invoice reflects what you actually completed.',view:'schedule',action:'Explore scheduling'},
   {title:'Finish with your own branded invoice',body:'Add your business logo, choose an invoice border color, and include payment terms. Record a payment when received, then create a follow-up task for a future maintenance detail if the customer wants one.',view:'invoices',action:'Explore invoices'},
  ],
  intake:[{label:'Vehicle and condition',reason:'Make, model, size, and condition help you define the job. Keep these in your customer or job notes.'},{label:'Requested service',reason:'Record the package, add-ons, and exclusions so the quote is specific.'},{label:'Mobile service location',reason:'Save the address and access details you need for the visit; confirm parking and any utilities your process requires.'},{label:'Next action',reason:'A due-dated task makes a missing photo, quote follow-up, or booking confirmation easy to find.'}],
  checklist:['Confirm the vehicle, location, and agreed service.','Check the job notes before starting work.','Record any agreed additions to the scope.','Prepare the final invoice and record the payment.'],
  setup:['Choose Mobile detailing during business setup.','Keep Customers, Quotes, Schedule, Jobs, Invoices, and Tasks enabled. Keep Leads for inquiries and Vehicles for each customer’s service details.','Add one customer and one real service to your workflow before moving your existing records.'],
  image:'customers',imageAlt:'Mako customer board showing fictional customer records and contact details',
  faqs:[{question:'Can I keep vehicle information with a customer?',answer:'Yes. Use customer and job notes for the vehicle and service history. The Assets tool can also be enabled for equipment or vehicle records; review the demo to see whether its fields fit your process.'},{question:'Does Mako automatically calculate detailing prices?',answer:'You set your service prices and quote line items. The workflow above helps you capture the information needed to quote; it is not an automatic vehicle-condition pricing engine.'},{question:'Can I start with a Google Sheets CRM instead?',answer:'Yes. Mako also offers separate Google Sheets toolkits through its template store, including a mobile detailing toolkit. Check the product page for its included tools and one-time price.'}],
 },
 {
  slug:'cleaning',name:'Cleaning businesses',shortName:'Cleaning',icon:'cleaning',preset:'Cleaning',
  title:'Cleaning Business CRM for Visits, Tasks & Invoices | Mako CRM',
  description:'Keep cleaning customers, property notes, quotes, scheduled visits, job checklists, and invoices organized in Mako CRM. Explore the demo. Pro is $100/month.',
  headline:'Keep the visit organized. Keep the customer remembered.',
  intro:'A CRM for residential and small commercial cleaning businesses, with a clear place for customer preferences, visit details, tasks, and invoices.',
  example:{customer:'Taylor Morgan',work:'Move-out clean · two-bedroom home',status:'Visit planned',notes:['Include inside cabinets in the quote','Confirm access with the customer','Final walkthrough before invoicing']},
  problem:{heading:'A cleaning appointment needs more context than a date on a calendar.',body:'A first deep clean, a move-out visit, and regular office cleaning can involve very different work. Keep the property notes, agreed scope, and customer preferences alongside the scheduled job. That gives you a consistent place to check the details before each visit and record what changed afterward.'},
  steps:[
   {title:'Create a useful customer record',body:'Save the contact name, address, and preferred way to reach the customer. Use notes for cleaning preferences and property details. Avoid storing alarm codes or other sensitive access credentials in ordinary job notes.',view:'customers',action:'Explore customer records'},
   {title:'Agree on what the clean includes',body:'Build a quote around the type of visit and any extras, such as an oven clean or inside cabinets. Document exclusions and questions before confirming the work so the customer and your team share the same scope.',view:'quotes',action:'Explore quotes'},
   {title:'Give each visit a checklist',body:'Schedule the job and add a checklist for the agreed rooms or areas. Create tasks for preparation or follow-ups, and update the job notes if a customer asks for a change. Plan later visits explicitly in Schedule.',view:'jobs',action:'Explore jobs and checklists'},
   {title:'Keep billing separate from unfinished work',body:'Prepare an invoice for completed work and record payments received. If you enable recurring invoice drafts for regular customers, review each draft before issuing it; a draft does not confirm a visit happened.',view:'invoices',action:'Explore invoicing'},
  ],
  intake:[{label:'Visit type and property details',reason:'Record whether the request is a regular clean, deep clean, or move-out clean, with the rooms or areas included.'},{label:'Customer preferences',reason:'Keep agreed product preferences and priorities easy to find before the visit.'},{label:'Extras and exclusions',reason:'Separate optional work from the base scope so the quote and checklist agree.'},{label:'Visit date and next follow-up',reason:'Use the schedule for the visit and a task for any unanswered question or rebooking request.'}],
  checklist:['Review the agreed rooms, extras, and exclusions.','Confirm the visit time and access arrangements securely.','Check off completed areas and note requested changes.','Complete the walkthrough and review the invoice.'],
  setup:['Choose Cleaning during business setup.','Enable Customers, Quotes, Schedule, Jobs, Invoices, and Tasks. Turn on other tools only when your process needs them.','Start with one upcoming visit and a short checklist you already use.'],
  image:'tasks',imageAlt:'Mako task board with fictional assignments, due dates, priorities, and statuses',
  faqs:[{question:'Does this book recurring cleaning visits automatically?',answer:'The workflow here uses scheduled visits you plan in Mako. Recurring invoice drafts are a separate billing tool; they do not automatically create or complete cleaning visits.'},{question:'Can I use a different checklist for each job?',answer:'Yes. Add checklist items to the job to reflect the agreed scope. For example, a move-out clean can include different items from a regular office visit.'},{question:'Is this a separate cleaning-only app?',answer:'No. Mako Pro is a flexible service-business workspace. The Cleaning setup selects relevant tools, and you can adjust them in Business settings. You do not need to manage a separate app for this workflow.'}],
 },
 {
  slug:'lawn-care',name:'Lawn care & landscaping businesses',shortName:'Lawn care',icon:'lawn',preset:'Landscaping & lawn care',
  title:'Lawn Care & Landscaping CRM for Leads, Jobs & Quotes | Mako CRM',
  description:'Lawn care and landscaping CRM for customers, properties, estimates, recurring visits, job checklists, and invoices. Plans from $49/month. Try the free demo.',
  headline:'Your lawn care business. One connected CRM.',
  intro:'A CRM for lawn care and landscaping businesses that need a clear path from property inquiries and estimates to scheduled work and invoices.',
  example:{customer:'Alex Rivera',work:'Seasonal cleanup · front and back yard',status:'Estimate follow-up',notes:['Confirm debris removal in the scope','Side gate access needs a check','Schedule after the customer accepts the quote']},
  problem:{heading:'The property, the scope, and the follow-up all matter.',body:'A mowing inquiry is different from a seasonal cleanup or a landscaping project. Keep the property details and requested work with the lead, record what you still need to inspect, and give the estimate a next action. This helps you see which inquiries need a site visit, which quotes need a reply, and which jobs are ready to schedule.'},
  steps:[
   {title:'Turn an inquiry into a next action',body:'Save the lead with the service address and requested work. Note any questions about access, debris removal, or the area involved, then create a task for the site visit or estimate follow-up.',view:'leads',action:'Explore the lead pipeline'},
   {title:'Build an estimate around the property',body:'Use quote line items to separate labor, materials, or distinct services. Record what is included, such as hauling debris, and what needs a separate agreement. You enter the measurements and prices used in the quote.',view:'quotes',action:'Explore estimates'},
   {title:'Plan the work with useful job notes',body:'Link the customer to the job, set the work date, and add a checklist for preparation and completion. If weather changes the plan, update the date and contact the customer through your normal communication process.',view:'jobs',action:'Explore job planning'},
   {title:'Close out the job and keep the relationship',body:'Prepare the invoice, record payments, and note any remaining follow-up. Use a future task for a seasonal service discussion or a requested maintenance visit so the next opportunity has a place to live.',view:'tasks',action:'Explore follow-up tasks'},
  ],
  intake:[{label:'Service address and access',reason:'Record the property location and useful access notes. Confirm gates or obstacles before planning equipment needs.'},{label:'Requested work and site questions',reason:'Separate mowing, cleanup, planting, or another service, and list anything that needs an inspection.'},{label:'Quote scope',reason:'Make materials, hauling, and exclusions explicit instead of relying on a message thread.'},{label:'Work date and follow-up',reason:'Keep the planned date visible and give estimate follow-ups their own due-dated task.'}],
  checklist:['Review the accepted scope and service address.','Confirm site access and equipment preparation.','Record agreed scope changes before extra work.','Check completion, prepare the invoice, and plan any follow-up.'],
  setup:['Choose Landscaping & lawn care during business setup.','Use Leads, Customers, Quotes, Schedule, Jobs, Invoices, and Tasks for the inquiry-to-job workflow.','Add an open estimate first, then create its next follow-up task.'],
  image:'leads',imageAlt:'Mako lead board with fictional opportunities, pipeline stages, and estimated deal values',
  faqs:[{question:'Does Mako measure lawns or optimize driving routes?',answer:'The workflow described here does not include automatic property measurement or route optimization. You supply your measurements, service prices, and scheduling decisions.'},{question:'Can I track one-off jobs as well as ongoing customers?',answer:'Yes. Keep the customer record and create the work and follow-up tasks that fit the service. Plan each visit explicitly; recurring invoice drafts are a separate tool for billing.'},{question:'Can I keep photos with a job?',answer:'Yes. The Jobs tool supports job photos and checklists. Use those records for relevant job details, and review what information is appropriate to share before uploading or sending it.'}],
 },
];
export const industryPath=(slug:string)=>`/for/${slug}`;
export const findIndustry=(slug:string)=>industryPages.find(page=>page.slug===slug);
