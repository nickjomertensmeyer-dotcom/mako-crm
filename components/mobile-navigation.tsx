"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {Menu,ChevronDown} from 'lucide-react';
export function MobileNavigation({current,children}:{current:string;children:ReactNode}){const [open,setOpen]=useState(false);useEffect(()=>setOpen(false),[current]);return <div className="mobile-navigation" data-open={open}><button className="mobile-navigation-toggle" type="button" aria-expanded={open} aria-controls="workspace-navigation-tools" onClick={()=>setOpen(!open)}><Menu size={18}/>Workspace menu<ChevronDown size={16}/></button><div id="workspace-navigation-tools">{children}</div></div>;}
