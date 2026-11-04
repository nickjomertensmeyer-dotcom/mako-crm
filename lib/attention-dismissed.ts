// Remembers which "Needs attention" items the person has dismissed.
// Kept in this browser for instant updates and, when signed in, saved to their account so it follows them across devices.
// Item keys look like "lead:<id>", "invoice:<id>", "work:<id>" or "conn:<id>".
import {loadDismissals,removeDismissals,saveDismissal} from '@/app/workspace/attention-actions';
const KEY='mako-attention-dismissed-v1',EVENT='mako-attention-dismissals';
export function readDismissed():Set<string>{try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');return new Set(Array.isArray(raw)?raw.filter((x:unknown):x is string=>typeof x==='string').slice(-500):[]);}catch{return new Set();}}
function write(set:Set<string>){try{localStorage.setItem(KEY,JSON.stringify([...set].slice(-500)));}catch{/* Dismissing still works for this page view. */}window.dispatchEvent(new Event(EVENT));}
export function dismissItem(key:string,remote=false){const set=readDismissed();set.add(key);write(set);if(remote)void saveDismissal(key);}
export function restoreItems(keys?:string[],remote=false){const set=readDismissed();if(keys)keys.forEach(k=>set.delete(k));else set.clear();write(set);if(remote)void removeDismissals(keys);}
/** Pull this person's saved dismissals from their account and merge them into this browser. */
export async function syncDismissals(){const saved=await loadDismissals();if(!saved.length)return;const set=readDismissed();let changed=false;for(const key of saved)if(!set.has(key)){set.add(key);changed=true;}if(changed)write(set);}
export function onDismissalsChange(callback:()=>void){window.addEventListener(EVENT,callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener(EVENT,callback);window.removeEventListener('storage',callback);};}
