import type {ReactNode} from 'react';
import {Brand} from '@/components/brand';
import {HomeNavigation} from '@/components/home-navigation';
import {businessInfo} from '@/lib/business-info';
import '@/app/homepage.css';
import './industry-pages.css';
export function IndustryShell({children}:{children:ReactNode}){
 return <main id="main" className="marketing mako-home industry-page"><header className="marketing-header"><Brand/><HomeNavigation/></header>{children}<footer className="marketing-footer"><Brand/><div><strong>Mako CRM</strong><p>Stay sharp. Move faster.</p><a href={`mailto:${businessInfo.supportEmail}`}>{businessInfo.supportEmail}</a></div><nav aria-label="Footer navigation"><a href="/for">Business workflows</a><a href="/reviews">Reviews</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/login">Log in</a></nav></footer></main>;
}
