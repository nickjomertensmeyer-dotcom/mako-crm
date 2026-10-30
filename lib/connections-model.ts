export const connectionApps=[
 {id:'google-calendar',name:'Google Calendar',category:'Schedule',description:'Display appointments and delete Google events after confirmation.',permission:'Calendar list and event access',scope:''},
 {id:'google-contacts',name:'Google Contacts',category:'Customers & leads',description:'Preview contacts and import selected people with duplicate checks.',permission:'Read your Google contacts',scope:'https://www.googleapis.com/auth/contacts.readonly'},
 {id:'gmail',name:'Gmail',category:'Email',description:'Send customer emails from your connected Gmail account.',permission:'Send email on your behalf',scope:'https://www.googleapis.com/auth/gmail.send'},
 {id:'google-drive',name:'Google Drive',category:'Files',description:'Upload files through Mako and link them to customer records.',permission:'Files created or opened through Mako',scope:'https://www.googleapis.com/auth/drive.file'},
 {id:'outlook',name:'Microsoft Outlook',category:'Email & schedule',description:'Microsoft email, contacts, and calendar connection.',permission:'Requires Microsoft application setup',scope:''},
 {id:'quickbooks',comingSoon:true,name:'QuickBooks Online',category:'Accounting',description:'Connect your accounting to Mako. QuickBooks invoice and payment syncing is coming soon.',permission:'Available after production approval',scope:''},
 {id:'stripe',name:'Stripe',category:'Customer payments',description:'Receive invoice payments directly into your business’s Stripe account.',permission:'Separate from your Mako subscription',scope:''},
 {id:'sms',name:'Text reminders',category:'Messaging',description:'Appointment and follow-up messages for customers who opt in.',permission:'Requires a verified SMS sender and provider account',scope:''}
] as const;
export function connectionComingSoon(id:string){return Boolean((appDefinition(id) as {comingSoon?:boolean}|undefined)?.comingSoon);}
export const quickBooksComingSoonMessage='QuickBooks connections and accounting sync are coming soon.';
export type ConnectionApp=typeof connectionApps[number]['id'];
export function appDefinition(id:string){return connectionApps.find(app=>app.id===id);}
export function emailAddress(value:unknown){return typeof value==='string'&&value.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);}
export type ImportedPerson={externalId:string;name:string;email:string;phone:string;company:string};
export function normalizePerson(person:{resourceName?:string;names?:{displayName?:string}[];emailAddresses?:{value?:string}[];phoneNumbers?:{value?:string}[];organizations?:{name?:string}[]}):ImportedPerson|null{
 if(!person.resourceName||!/^people\/[\w-]+$/.test(person.resourceName))return null;
 const email=person.emailAddresses?.find(e=>emailAddress(e.value))?.value||'';
 const name=(person.names?.[0]?.displayName||email).trim().slice(0,120);if(!name)return null;
 return {externalId:person.resourceName,name,email,phone:(person.phoneNumbers?.[0]?.value||'').slice(0,40),company:(person.organizations?.[0]?.name||'').slice(0,120)};
}
export function safeFileLink(value:unknown){try{const url=new URL(String(value));return url.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(url.hostname)?url.href:null;}catch{return null;}}
export function mailPayload(to:string,subject:string,body:string){
 if(!emailAddress(to)||!subject.trim()||subject.length>200||/[\r\n]/.test(subject)||!body.trim()||body.length>20000)throw new Error('Enter a valid recipient, subject, and message.');
 return `To: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body).toString('base64')}`;
}
