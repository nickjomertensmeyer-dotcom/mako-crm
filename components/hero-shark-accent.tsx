'use client';

import { useState, type PointerEvent } from 'react';

const shark = 'M2 8 11 13C17 9 23 8 28 10L26 2 36 11C42 12 46 14 48 16C43 20 35 21 29 19L25 27 22 19C17 20 13 18 10 17L2 24 5 16Z';

export function HeroSharkAccent() {
  const [cursor, setCursor] = useState<number | null>(null);

  function followPointer(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    // Match the inset waterline so the crest stays directly under the pointer.
    const position = (event.clientX - bounds.left - bounds.width * .04) / (bounds.width * .92);
    setCursor(Math.max(0, Math.min(1000, position * 1000)));
  }

  const x = cursor ?? 500;
  const wave = `M0 20 H${x - 95} C${x - 55} 20 ${x - 50} 6 ${x} 6 C${x + 50} 6 ${x + 55} 20 ${x + 95} 20 H1000`;

  return (
    <span className="hero-shark-accent" aria-hidden="true"
      data-cursor-active={cursor !== null}
      onPointerEnter={followPointer} onPointerMove={followPointer}
      onPointerLeave={() => setCursor(null)} onPointerCancel={() => setCursor(null)}>
      <span className="hero-shark-water" />
      {['blue', 'purple', 'cyan'].map(color => (
        <svg key={color} className={`hero-shark hero-shark-${color}`} viewBox="0 0 48 30" fill="none">
          <path d={shark} fill="currentColor" />
          <path d="M32 12 30 16M28 12 26 16" stroke="white" strokeWidth="1" opacity=".6" />
        </svg>
      ))}
      <svg className="hero-water-cursor" viewBox="0 0 1000 30" preserveAspectRatio="none" fill="none">
        <defs>
          <linearGradient id="hero-cursor-gradient" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2454ef" stopOpacity="0" />
            <stop offset=".15" stopColor="#2454ef" />
            <stop offset=".5" stopColor="#793ce6" />
            <stop offset=".85" stopColor="#00cbe8" />
            <stop offset="1" stopColor="#00cbe8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={wave} stroke="url(#hero-cursor-gradient)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
