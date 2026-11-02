import Image from 'next/image';
export function Brand() { return <a className="brand" href="/" aria-label="Mako home"><Image src="/mako-logo-transparent.png" alt="Mako" width={100} height={80} priority /><span>STAY SHARP.<br />MOVE FASTER.</span></a>; }
