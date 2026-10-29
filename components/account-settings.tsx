'use client';
import Image from 'next/image';
import {SharkyAssistant} from './sharky-assistant';
import {preparePhoto} from '@/lib/image-client';
import Link from 'next/link';
import {createContext,useContext,useEffect,useRef,useState,useTransition,type ReactNode,type MouseEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ChevronDown,Settings,Settings2,Palette,LogOut,Check,UserRound} from 'lucide-react';
import {logout} from '@/app/auth/actions';
import {saveAccountSettings} from '@/app/workspace/account-actions';
import {accountSettings,type AccountSettings} from '@/lib/account';

const demoDefaults={...accountSettings({},'alex@example.com'),name:'Alex Morgan'};
const AccountContext=createContext<{settings:AccountSettings;setSettings:(value:AccountSettings)=>void;demo:boolean}>({settings:demoDefaults,setSettings:()=>{},demo:true});
export function AccountShell({initial,demo,current,children,assistantEnabled=false}:{initial?:AccountSettings;demo:boolean;current:string;children:ReactNode;assistantEnabled?:boolean}){
  const [settings,setSettings]=useState(initial||demoDefaults),[systemDark,setSystemDark]=useState(false),[pending,startTransition]=useTransition();
  const router=useRouter(),lastView=useRef(current);
  useEffect(()=>{if(lastView.current!==current){lastView.current=current;if(!window.location.hash)window.scrollTo({top:0,behavior:'instant'});}},[current]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const update=()=>setSystemDark(media.matches);update();media.addEventListener('change',update);
    if(demo){try{const saved=sessionStorage.getItem('mako-demo-account');if(saved){const parsed=JSON.parse(saved);setSettings({...accountSettings({display_name:parsed.name,mako_appearance:parsed.appearance,mako_density:parsed.density,mako_reduce_motion:parsed.reducedMotion},demoDefaults.email),avatar:typeof parsed.avatar==='string'&&parsed.avatar.startsWith('data:image/webp;base64,')?parsed.avatar:''});}}catch{/* Storage may be disabled. */}}
    const reset=()=>{setSettings(demoDefaults);sessionStorage.removeItem('mako-demo-account');sessionStorage.removeItem('mako-demo-business');};
    if(demo)window.addEventListener('mako-demo-reset',reset);
    return()=>{media.removeEventListener('change',update);window.removeEventListener('mako-demo-reset',reset);};
  },[demo]);
  function change(value:AccountSettings){setSettings(value);if(demo){try{sessionStorage.setItem('mako-demo-account',JSON.stringify(value));}catch{/* Preferences remain in memory. */}}}
  function navigate(event:MouseEvent<HTMLDivElement>){
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if(!link||link.target||link.hasAttribute('download')||link.getAttribute('href')?.startsWith('#'))return;
    const target=new URL(link.href,window.location.href);
    if(target.origin!==window.location.origin||!['/workspace','/preview'].includes(target.pathname)||target.href===window.location.href)return;
    event.preventDefault();startTransition(()=>router.push(target.pathname+target.search+target.hash,{scroll:false}));
  }
  const dark=settings.appearance==='dark'||(settings.appearance==='system'&&systemDark);
  return <AccountContext.Provider value={{settings,setSettings:change,demo}}><div className="app-shell" data-theme={dark?'dark':'light'} data-density={settings.density} data-reduced-motion={settings.reducedMotion?'true':'false'} data-navigating={pending?'true':'false'} onClick={navigate}>{children}<SharkyAssistant demo={demo} enabled={assistantEnabled} requested={current==='assistant'}/><span className="navigation-status" role="status" aria-live="polite">{pending?'Loading workspace…':''}</span><span className="sr-only">{current}</span></div></AccountContext.Provider>;
}
function Photo({className=''}:{className?:string}){
  const {settings,demo}=useContext(AccountContext);const [failed,setFailed]=useState('');
  const source=settings.avatar?(demo?settings.avatar:`/api/account/avatar?v=${encodeURIComponent(settings.avatar)}`):'';
  return <span className={`profile-photo ${className}`}>{source&&failed!==source?<Image src={source} alt="" width={96} height={96} unoptimized onError={()=>setFailed(source)}/>:settings.name.slice(0,1).toUpperCase()||<UserRound size={20}/>}</span>;
}
export function ProfileMenu(){
  const {settings,demo}=useContext(AccountContext),menu=useRef<HTMLDetailsElement>(null);const base=demo?'/preview':'/workspace';
  useEffect(()=>{const close=(event:globalThis.MouseEvent)=>{if(!menu.current?.contains(event.target as Node)&&menu.current)menu.current.open=false;};document.addEventListener('click',close);return()=>document.removeEventListener('click',close);},[]);
  return <details className="profile-menu" ref={menu} onKeyDown={event=>{if(event.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}><summary aria-label="Open profile menu"><Photo/><ChevronDown size={14}/></summary><div className="profile-dropdown"><strong>{settings.name||'Your account'}</strong><small>{settings.email||'Account preferences'}</small><Link href={`${base}?view=settings`} onClick={()=>{if(menu.current)menu.current.open=false;}}><Settings size={17}/>Settings</Link><Link href={`${base}?view=business-settings`} onClick={()=>{if(menu.current)menu.current.open=false;}}><Settings2 size={17}/>Business settings</Link><Link href={`${base}?view=settings#appearance`} onClick={()=>{if(menu.current)menu.current.open=false;}}><Palette size={17}/>Appearance</Link>{demo?<Link href="/login"><LogOut size={17}/>Exit demo</Link>:<form action={logout}><button type="submit"><LogOut size={17}/>Sign out</button></form>}</div></details>;
}
export function AccountSettingsPage({owner=false}:{owner?:boolean}){
  const {settings,setSettings,demo}=useContext(AccountContext);const [busy,setBusy]=useState(''),[feedback,setFeedback]=useState({section:'',error:false,text:''});
  async function save(form:FormData){
    const section=String(form.get('section'));setBusy(section);setFeedback({section,error:false,text:''});
    try{
      const file=form.get('photo');if(file instanceof File&&file.size){const blob=await preparePhoto(file);form.set('photo',blob,'profile.webp');}
      if(demo){let next={...settings};if(section==='appearance')next={...next,appearance:form.get('appearance') as AccountSettings['appearance'],density:form.get('density') as AccountSettings['density'],reducedMotion:form.get('reducedMotion')==='on'};else{
        const name=String(form.get('name')||'').trim();if(!name||name.length>80)throw new Error('Enter a display name between 1 and 80 characters.');next.name=name;
        const photo=form.get('photo');if(photo instanceof File&&photo.size)next.avatar=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Unable to read photo.'));reader.readAsDataURL(photo);});else if(form.get('removePhoto')==='on')next.avatar='';
      }setSettings(next);}else{const result=await saveAccountSettings(form);if(result.error||!result.settings)throw new Error(result.error||'Unable to save.');setSettings(result.settings);}
      setFeedback({section,error:false,text:demo?'Applied for this demo session only.':'Settings saved to your account.'});
    }catch(error){setFeedback({section,error:true,text:error instanceof Error?error.message:'Unable to save settings.'});}finally{setBusy('');}
  }
  const result=(section:string)=>feedback.section===section&&feedback.text?<p className={feedback.error?'settings-error':'settings-success'} role={feedback.error?'alert':'status'}>{!feedback.error&&<Check size={16}/>} {feedback.text}</p>:null;
  return <section className="account-settings"><div className="board-heading"><div><p className="eyebrow">MAKE MAKO YOURS</p><h1>Settings</h1><p>Manage your profile, appearance, and comfort.</p></div></div>{demo&&<p className="notice demo-settings-notice"><strong>This is the demo. Changes will not be saved to a real account.</strong> Settings are temporary and last only for this browser tab’s session. Reset demo restores the defaults.</p>}<nav className="settings-jumps" aria-label="Settings sections"><a href="#profile">Profile</a><a href="#appearance">Appearance</a><a href="#account">Account & help</a></nav>
    <section className="panel" id="profile"><h2>Your profile</h2><form action={save}><input type="hidden" name="section" value="profile"/><div className="photo-setting"><Photo className="large"/><div><label htmlFor="photo">Profile picture</label><input id="photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp"/><p className="muted small-copy">PNG, JPEG, or WebP, up to 5 MB. Cropped to a square.</p><label className="check-setting"><input type="checkbox" name="removePhoto"/>Remove current picture</label></div></div><label htmlFor="display-name">Display name</label><input id="display-name" name="name" required maxLength={80} defaultValue={settings.name} autoComplete="name"/><label htmlFor="account-email">Email address</label><input id="account-email" value={settings.email} readOnly type="email"/><p className="muted small-copy">Your picture appears in your profile menu. Your display name also appears in workspace assignments.</p><button className="primary" disabled={Boolean(busy)}>{busy==='profile'?'Saving…':'Save profile'}</button>{result('profile')}</form></section>
    <section className="panel" id="appearance"><h2>Appearance</h2><form action={save}><input type="hidden" name="section" value="appearance"/><label htmlFor="appearance-mode">Color theme</label><select id="appearance-mode" name="appearance" defaultValue={settings.appearance} key={`theme-${settings.appearance}`}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Use device setting</option></select><label htmlFor="density">Board spacing</label><select id="density" name="density" defaultValue={settings.density} key={`density-${settings.density}`}><option value="comfortable">Comfortable</option><option value="compact">Compact — more rows on screen</option></select><label className="check-setting"><input type="checkbox" name="reducedMotion" defaultChecked={settings.reducedMotion} key={`motion-${settings.reducedMotion}`}/>Reduce animation</label><p className="muted small-copy">Device reduced-motion preferences are always respected. Appearance changes apply after saving.</p><button className="primary" disabled={Boolean(busy)}>{busy==='appearance'?'Saving…':'Save appearance'}</button>{result('appearance')}</form></section>
    <section className="panel" id="account"><h2>Account & help</h2><div className="settings-links">{!demo&&<Link href="/forgot-password">Reset password</Link>}<Link href={`${demo?'/preview':'/workspace'}?view=support`}>Help & support</Link>{owner&&!demo&&<Link href="/onboarding">Configure workspace tools</Link>}<Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>{demo?<Link href="/login" className="secondary">Exit demo</Link>:<form action={logout}><button className="secondary"><LogOut size={16}/>Sign out</button></form>}</section>
  </section>;
}
