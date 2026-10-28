'use client';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main id="main" className="loading-workspace"><h1>Your workspace couldn’t load.</h1><p>Your records are unchanged. Retry or contact Mako if this continues.</p><button className="primary" onClick={reset}>Try again</button> <a href="mailto:makocrm@gmail.com">Contact support</a></main>;}
