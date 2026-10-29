'use client';
import Link,{useLinkStatus} from 'next/link';
import {useState,type ComponentProps} from 'react';
function NavigationFeedback(){
 const {pending}=useLinkStatus();
 return <span className="workspace-link-progress" data-pending={pending} role="status">{pending&&<span className="sr-only">Loading page…</span>}</span>;
}
export function WorkspaceLink({children,onMouseEnter,onFocus,...props}:ComponentProps<typeof Link>){
 const [warm,setWarm]=useState(false);
 return <Link {...props} prefetch={warm} onMouseEnter={event=>{setWarm(true);onMouseEnter?.(event);}} onFocus={event=>{setWarm(true);onFocus?.(event);}}>{children}<NavigationFeedback/></Link>;
}
