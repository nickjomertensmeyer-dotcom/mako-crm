'use client';
import {useEffect,useState} from 'react';
import {ConnectionLogo} from './connection-logo';
import {CheckCircle2,ChevronDown,ExternalLink,Link2,LoaderCircle,RefreshCw,Unplug} from 'lucide-react';
type Connection={connected:boolean;needsReconnect?:boolean;canDelete?:boolean;timeZone?:string;calendarId?:string;calendars?:{id:string;name:string}[]};
const announce=()=>window.dispatchEvent(new Event('mako-google-calendar-changed'));
export function GoogleCalendarConnect({demo=false}:{demo?:boolean}){
 const [expanded,setExpanded]=useState(false);
 const [connection,setConnection]=useState<Connection>({connected:false}),[loading,setLoading]=useState(!demo),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[zone,setZone]=useState('UTC'),[zones,setZones]=useState<string[]>(['UTC']);
 useEffect(()=>{
  const detected=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';setZone(detected);setZones([...new Set(['UTC',detected,...Intl.supportedValuesOf('timeZone')])].sort());
  if(demo)return;const controller=new AbortController();
  fetch('/api/google-calendar',{cache:'no-store',signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load Google Calendar.');setConnection(result);if(result.timeZone)setZone(result.timeZone);}).catch(error=>{if(!controller.signal.aborted){setError(error instanceof Error?error.message:'Could not load Google Calendar.');setExpanded(true);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[demo]);
 async function action(value:'connect'|'select'|'disconnect',calendarId?:string){
  if(demo){setMessage('This is the demo. Activate Pro in your own workspace to view your Google Calendar. No Google account will be connected here.');return;}
  setBusy(value);setError('');setMessage('');
  try{
   const response=await fetch('/api/google-calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:value,timeZone:zone,calendarId})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Google Calendar could not complete this action.');
   if(result.url){window.location.assign(result.url);return;}
   setConnection(previous=>({...previous,...result}));setMessage(result.message||'Calendar updated.');announce();
  }catch(error){setError(error instanceof Error?error.message:'Google Calendar could not complete this action.');setExpanded(true);}finally{setBusy('');}
 }
 const readable=connection.connected&&!connection.needsReconnect;
 return <details className="google-calendar-connect google-calendar-dropdown" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)} aria-label="Google Calendar connection" aria-busy={loading||Boolean(busy)}>
  <summary className="google-calendar-heading"><span className="google-calendar-symbol"><ConnectionLogo app="google-calendar"/></span><span className="google-calendar-summary-copy"><strong>Google Calendar → Mako</strong><span className="google-calendar-summary-status">{error?'Connection needs attention':loading?'Checking connection…':readable?<><CheckCircle2 size={13}/> Connected · {connection.canDelete?'event access':'read only'}</>:connection.needsReconnect?'Reconnect to display your Google events':'Connect to display your Google events'}</span></span>{demo&&<span className="badge">Demo</span>}<ChevronDown className="google-calendar-chevron" size={18}/></summary>
  <div className="google-calendar-dropdown-body">
  <div className="google-calendar-controls">
   {!readable&&<label>Display time zone<select value={zone} onChange={event=>setZone(event.target.value)} disabled={loading||Boolean(busy)}>{zones.map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>}
   {readable?<><label>Google calendar<select value={connection.calendarId||'primary'} disabled={loading||Boolean(busy)} onChange={event=>action('select',event.target.value)}>{(connection.calendars||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="primary compact" disabled={Boolean(busy)||loading} onClick={()=>{announce();setMessage('Refreshing Google events in the schedule below.');}}><RefreshCw size={16}/>Refresh Google events</button></>:<button className="primary compact" disabled={loading||Boolean(busy)} onClick={()=>action('connect')}>{loading||busy?<LoaderCircle size={16} className="calendar-spinning"/>:<Link2 size={16}/>} {busy?'Connecting…':connection.needsReconnect?'Reconnect Google Calendar':'Connect Google Calendar'}</button>}
   {readable&&!connection.canDelete&&<button type="button" className="secondary compact" disabled={Boolean(busy)} onClick={()=>action('connect')}>Allow Google event deletion</button>}
   <a className="secondary compact" href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer">Open Google Calendar<ExternalLink size={14}/></a>
   {connection.connected&&<details className="calendar-disconnect"><summary>Disconnect</summary><p>Removes this connection from Mako. Your Google calendars and events stay unchanged. You can revoke Mako’s permission in your Google Account settings.</p><button className="secondary compact" disabled={Boolean(busy)} onClick={()=>action('disconnect')}><Unplug size={15}/>Confirm disconnect</button></details>}
  </div>
  <p className="google-calendar-explainer">Display events from your selected Google calendar alongside Mako appointments and jobs. Events refresh when you open Schedule, change months, or choose Refresh. You can delete Google events here after allowing event access. Other edits stay in Google Calendar. Deletions affect Google itself and may notify guests. Only you can see events from your connection; they aren’t added to shared CRM records. {readable?`Display time zone: ${connection.timeZone?.replaceAll('_',' ')}.`:''}</p>
  {connection.needsReconnect&&<p className="calendar-connection-message">Reconnect to display your Google events.</p>}
  <p className="small-copy muted"><a href="/privacy#google-calendar">How Mako uses Google Calendar data</a></p>
  {error&&<div className="calendar-connection-error" role="alert">{error}</div>}{message&&<div className="calendar-connection-message" role="status">{message}</div>}
  </div>
 </details>;
}
