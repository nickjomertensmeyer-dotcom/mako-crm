'use client';
import {useId} from 'react';
export function SharkyIcon({size=48}:{size?:number}){
  const id=useId();
  return <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false"><defs><linearGradient id={id} x1="19" y1="22" x2="61" y2="62" gradientUnits="userSpaceOnUse"><stop stopColor="#00cbe8"/><stop offset=".55" stopColor="#3584ff"/><stop offset="1" stopColor="#793ce6"/></linearGradient></defs><path d="M17 59L48 17C43 37 47 49 63 59H17Z" stroke={`url(#${id})`} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
