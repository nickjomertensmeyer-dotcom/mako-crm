import type { Metadata } from 'next';
import './globals.css';
import './boards.css';
import './account.css';
export const metadata: Metadata = { title: { default: 'Mako | Your business, in focus', template: '%s | Mako' }, description: 'A clearer view of your customers, work, and next move.', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><a className="skip" href="#main">Skip to content</a>{children}<footer className="copyright-footer">© Mako CRM <span aria-hidden="true">·</span> Customer Relationship Systems</footer></body></html>; }
