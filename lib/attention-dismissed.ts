// Remembers which "Needs attention" items the person has dismissed. Stored in this browser only.
// Item keys look like "lead:<id>", "invoice:<id>", "work:<id>" or "conn:<id>".
const KEY='mako-attention-dismissed-v1',EVENT='mako-attention-dismissals';
export function readDismissed():Set<string>{try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');return new Set(Array.isArray(raw)?raw.filter((x:unknown):x is string=>typeof x==='string').slice(-500):[]);}catch{return new Set();}}
function write(set:Set<string>){try{localStorage.setItem(KEY,JSON.stringify([...set].slice(-500)));}catch{/* Dismissing still works for this page view. */}window.dispatchEvent(new Event(EVENT));}
export function dismissItem(key:string){const set=readDismissed();set.add(key);write(set);}
export function restoreItems(keys?:string[]){const set=readDismissed();if(keys)keys.forEach(k=>set.delete(k));else set.clear();write(set);}
export function onDismissalsChange(callback:()=>void){window.addEventListener(EVENT,callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener(EVENT,callback);window.removeEventListener('storage',callback);};}
