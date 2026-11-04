import type { Metadata } from 'next';
import {CookieNotice} from '@/components/cookie-notice';
import './globals.css';
import './boards.css';
import './account.css';
import './sharky.css';
import './operations.css';
import './google-calendar.css';
import './connections.css';
export const metadata: Metadata = { title: { default: 'Mako | Your business, in focus', template: '%s | Mako' }, description: 'A clearer view of your customers, work, and next move.', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><a className="skip" href="#main">Skip to content</a>{children}<CookieNotice/><footer className="copyright-footer">© Mako CRM <span aria-hidden="true">·</span> Customer Relationship Systems <span aria-hidden="true">·</span> <a href="/cookies">Cookies</a> <span aria-hidden="true">·</span> <a href="/privacy">Privacy</a></footer></body></html>; }
