import Image from 'next/image';
export function Brand() { return <a className="brand" href="/" aria-label="Mako home"><Image src="/mako-logo.webp" alt="Mako" width={100} height={80} priority /><span>FAST SYSTEMS.<br />CLEAR WATERS.</span></a>; }
