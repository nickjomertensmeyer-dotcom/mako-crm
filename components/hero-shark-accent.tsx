'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';

const shark = 'M2 8 11 13C17 9 23 8 28 10L26 2 36 11C42 12 46 14 48 16C43 20 35 21 29 19L25 27 22 19C17 20 13 18 10 17L2 24 5 16Z';
type Phase = 'idle' | 'following' | 'eating' | 'celebrating';

export function HeroSharkAccent() {
  const [cursor, setCursor] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sharkX, setSharkX] = useState(420);
  const [foodX, setFoodX] = useState(500);
  const [rare, setRare] = useState(false);
  const clicks = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function clearTimers() {
    timers.current.splice(0).forEach(clearTimeout);
  }

  function reset() {
    clearTimers();
    clicks.current = 0;
    setPhase('idle');
  }

  function reveal() {
    setRare(Math.random() < .08);
    setPhase('following');
  }

  function linger() {
    if (phase !== 'idle') return;
    clearTimers();
    timers.current.push(setTimeout(reveal, 2200));
  }

  function followPointer(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left - bounds.width * .04) / (bounds.width * .92);
    const x = Math.max(0, Math.min(1000, position * 1000));
    setCursor(x);
    if (phase !== 'eating' && phase !== 'celebrating') setSharkX(Math.max(45, Math.min(955, x - 65)));
  }

  function leave() {
    setCursor(null);
    if (phase === 'idle' || phase === 'following') reset();
  }

  function feed() {
    if (phase === 'eating' || phase === 'celebrating') return;
    clearTimers();
    if (phase === 'idle') reveal();
    clicks.current += 1;
    if (clicks.current < 3) return;
    const target = Math.max(60, Math.min(940, cursor ?? 500));
    setFoodX(target);
    setSharkX(target);
    setPhase('eating');
    timers.current.push(setTimeout(() => setPhase('celebrating'), 1100));
    timers.current.push(setTimeout(reset, 3800));
  }

  const x = cursor ?? 500;
  const wave = `M0 20 H${x - 95} C${x - 55} 20 ${x - 50} 6 ${x} 6 C${x + 50} 6 ${x + 55} 20 ${x + 95} 20 H1000`;

  return (
    <span className="hero-shark-accent" data-cursor-active={cursor !== null} data-shark-phase={phase}
      onPointerEnter={event => { followPointer(event); linger(); }} onPointerMove={followPointer}
      onPointerLeave={leave} onPointerCancel={leave}>
      <span className="hero-shark-water" aria-hidden="true" />
      {['blue', 'purple', 'cyan'].map(color => (
        <svg aria-hidden="true" key={color} className={`hero-shark hero-shark-${color}`} viewBox="0 0 48 30" fill="none">
          <path d={shark} fill="currentColor" />
          <path d="M32 12 30 16M28 12 26 16" stroke="white" strokeWidth="1" opacity=".6" />
        </svg>
      ))}
      <svg aria-hidden="true" className="hero-water-cursor" viewBox="0 0 1000 30" preserveAspectRatio="none" fill="none">
        <defs>
          <linearGradient id="hero-cursor-gradient" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2454ef" stopOpacity="0" /><stop offset=".15" stopColor="#2454ef" />
            <stop offset=".5" stopColor="#793ce6" /><stop offset=".85" stopColor="#00cbe8" />
            <stop offset="1" stopColor="#00cbe8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={wave} stroke="url(#hero-cursor-gradient)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {phase !== 'idle' && <span aria-hidden="true" className={`hero-easter-shark${rare ? ' is-rare' : ''}`} style={{left: `${4 + sharkX * .092}%`}}>
        <svg viewBox="0 0 48 30" fill="none"><path d={shark} fill="currentColor" /><circle cx="40" cy="14" r="1" fill="white" /><path d="M31 13 29 17M27 13 25 17" stroke="white" strokeWidth="1" opacity=".65" /></svg>
      </span>}
      {phase === 'eating' && <svg aria-hidden="true" className="hero-easter-fish" style={{left: `${4 + foodX * .092}%`}} viewBox="0 0 24 16"><path d="M3 8 0 3v10l3-5c6-8 14-7 21 0-7 7-15 8-21 0Z" fill="#00b9d4"/><circle cx="18" cy="7" r="1" fill="#14243f"/></svg>}
      {phase === 'celebrating' && <span className="hero-easter-message" role="status">Stay sharp. Move faster.</span>}
      <button className="hero-water-play" type="button" aria-label="Feed the Mako shark: press three times"
        onClick={feed} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { setCursor(500); linger(); } }} onBlur={leave} />
    </span>
  );
}
