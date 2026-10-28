'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main" className="onboarding"><section className="onboarding-card"><h1>Let’s reconnect.</h1><p>We couldn’t load this page. Try again or contact makocrm@gmail.com.</p><button className="primary" onClick={reset}>Try again</button><a className="text-link" href="/login">Back to login</a></section></main>;}
