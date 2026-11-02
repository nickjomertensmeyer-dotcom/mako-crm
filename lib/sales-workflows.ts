import type {Row} from './boards';
export const pipelineStages=['New','Contacted','Qualified','Won'] as const;
export function daysSince(value:unknown,today:string){if(typeof value!=='string')return null;const date=Date.parse(value),end=Date.parse(today+'T23:59:59Z');return Number.isFinite(date)&&Number.isFinite(end)?Math.max(0,Math.floor((end-date)/86400000)):null;}
export function lastLeadTouch(row:Row,activity:{record_id:string;created_at:string}[]){return activity.filter(a=>a.record_id===row.id).map(a=>a.created_at).sort().at(-1)||String(row.created_at||'');}
// Supports UTF-8 BOM, escaped quotes, CRLF and quoted multiline CSV fields.
export function parseContactCsv(input:string):string[][]{
 if(input.length>1000000)throw Error('Use a CSV smaller than 1 MB.');
 const text=input.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
 if(ch==='"'){if(cell||closed)throw Error('Unexpected quote. Export the file as CSV again.');quoted=true;}
 else if(ch===','||ch==='\n'||ch==='\r'){row.push(cell.trim());cell='';closed=false;if(ch!==','){if(row.some(Boolean))rows.push(row);row=[];if(ch==='\r'&&text[i+1]==='\n')i++;if(rows.length>201)throw Error('Import up to 200 contacts at a time.');}}
 else{if(closed&&!/\s/.test(ch))throw Error('Unexpected text after a quoted field.');if(!closed)cell+=ch;}
 }
 if(quoted)throw Error('A quoted field is incomplete. Export the file as CSV again.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length<2||rows.length>201)throw Error('Include a header row and 1–200 contacts.');if(rows[0].length>40||rows.some(r=>r.length>40))throw Error('Use no more than 40 columns.');return rows;
}
export type ImportContact={name:string;company:string;email:string;phone:string;notes:string};
export const importFields=['name','company','email','phone','notes'] as const;
export function validateImportContact(row:ImportContact){if(!row.name.trim()||row.name.length>120)return 'Name is required (up to 120 characters).';if(row.company.length>120||row.phone.length>40||row.notes.length>4000)return 'Company, phone, or notes are too long.';if(row.email&&(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.email)||row.email.length>254))return 'Check the email address.';return '';}
export function duplicateImport(row:ImportContact,contacts:{name?:unknown;email?:unknown;phone?:unknown}[]){return contacts.some(c=>(row.email&&String(c.email||'').toLowerCase()===row.email.toLowerCase())||(String(c.name||'').trim().toLowerCase()===row.name.trim().toLowerCase()&&String(c.phone||'')===row.phone));}
