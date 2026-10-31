'use client';
import {offerUndo} from './undo-notice';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Trash2,Undo2,LoaderCircle} from 'lucide-react';
import {setWorkTrash} from '@/app/workspace/business-actions';
export function WorkTrashControl({id,title,restore=false,enabled,demo=false,onDemo}:{id:string;title:string;restore?:boolean;enabled:boolean;demo?:boolean;onDemo?:(id:string,restore:boolean)=>void}){
 const router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState('');
 function change(){setError('');if(demo){onDemo?.(id,restore);if(!restore)offerUndo(`Moved ${title} to Trash.`,async()=>{onDemo?.(id,true);return {};});return;}start(async()=>{const result=await setWorkTrash(id,restore);if(result.error)setError(result.error);else{if(!restore)offerUndo(`Moved ${title} to Trash.`,async()=>{const result=await setWorkTrash(id,true);if(!result.error)router.refresh();return result;});router.refresh();}});}
 const button=<button type="button" className={`secondary compact ${restore?'':'work-delete-confirm'}`} disabled={pending||!enabled&&!demo} onClick={change}>{pending?<LoaderCircle size={15}/>:restore?<Undo2 size={15}/>:<Trash2 size={15}/>} {pending?'Saving…':restore?'Restore':'Move to Trash'}</button>;
 return <div className="work-trash-action">{restore?button:<details><summary aria-label={`Delete ${title}`}><Trash2 size={15}/>Delete</summary><p>Remove “{title}” from the schedule? You can restore it from Trash. Linked records stay intact.</p>{button}</details>}{error&&<p className="calendar-connection-error" role="alert">{error}</p>}</div>;
}
