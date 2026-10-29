'use client';
import {useId} from 'react';
export function SharkyIcon({size=48}:{size?:number}){
  const id=useId();
  return <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false"><defs><linearGradient id={id} x1="20" y1="17" x2="61" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#00cbe8"/><stop offset=".55" stopColor="#3584ff"/><stop offset="1" stopColor="#793ce6"/></linearGradient></defs><path d="M17 52C29 42 36 24 50 11C46 29 49 42 65 51C48 46 33 47 17 52Z" fill={`url(#${id})`}/><path d="M12 59C25 53 34 54 43 58C52 62 61 61 69 56" stroke="#00cbe8" strokeWidth="4" strokeLinecap="round"/><path d="M19 68C30 64 38 65 46 68C53 70 59 69 64 66" stroke="#793ce6" strokeWidth="3" strokeLinecap="round"/></svg>;
}
