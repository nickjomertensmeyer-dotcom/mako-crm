import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {calendarOrigin,encryptionKey,sealCalendar,openCalendar,matchesState,validTimeZone,calendarEvent,eventId} from '../lib/google-calendar-security.ts';
import {syncCalendarEvents} from '../lib/google-calendar-security.ts';

test('calendar sync retries update existing events and do not duplicate or email anyone',async()=>{
 const records=[{id:'one',title:'Site visit',kind:'Appointment',status:'Planned',scheduled_date:'2026-10-29',scheduled_time:'09:00:00'}],events=new Map();
 let inserts=0;
 const request=async(path,method,body)=>{assert.equal(body.attendees,undefined);if(method==='POST'){inserts++;if(events.has(body.id))throw {status:409};events.set(body.id,body);}else{if(!events.has(body.id))throw {status:404};events.set(body.id,body);}};
 assert.deepEqual(await syncCalendarEvents(records,'workspace','UTC','https://usemakocrm.com','calendar',request),{completed:1,complete:true});
 await syncCalendarEvents([{...records[0],scheduled_date:'2026-11-01'}],'workspace','UTC','https://usemakocrm.com','calendar',request);
 assert.equal(inserts,1);assert.equal(events.size,1);assert.equal([...events.values()][0].start.dateTime,'2026-11-01T09:00:00');
});
test('partial calendar failures finish outstanding writes and support safe retries',async()=>{
 const record={id:'one',title:'Work',kind:'Job',status:'Planned',scheduled_date:'2026-10-29',scheduled_time:null};
 let finished=false;
 const result=await syncCalendarEvents([record,{...record,id:'two'}],'workspace','UTC','https://usemakocrm.com','calendar',async(path)=>{if(path.endsWith(eventId('workspace','one')))throw {status:403};await new Promise(resolve=>setTimeout(resolve,10));finished=true;});
 assert.equal(finished,true);assert.deepEqual(result,{completed:1,complete:false});
 let calls=0;const race=await syncCalendarEvents([record],'workspace','UTC','https://usemakocrm.com','calendar',async(_path,method)=>{calls++;if(calls===1)throw {status:404};if(method==='POST')throw {status:409};});
 assert.deepEqual(race,{completed:1,complete:true});assert.equal(calls,3);
});

test('Google credentials are authenticated, encrypted, and bound to one member/workspace',()=>{
 const key=encryptionKey('a'.repeat(64)),context='workspace-a:member-a';
 const sealed=sealCalendar('fixture-refresh-token',key,context);
 assert.ok(!sealed.includes('fixture-refresh-token'));
 assert.equal(openCalendar(sealed,key,context),'fixture-refresh-token');
 assert.notEqual(sealed,sealCalendar('fixture-refresh-token',key,context));
 assert.throws(()=>openCalendar(sealed,key,'workspace-b:member-a'));
 assert.throws(()=>openCalendar(sealed,encryptionKey('b'.repeat(64)),context));
 assert.throws(()=>openCalendar(sealed.slice(0,-4)+'AAAA',key,context));
 assert.throws(()=>encryptionKey('not-a-secret-key'));
 assert.equal(matchesState('expected-state','other-state'),false);
 assert.equal(matchesState('expected-state','expected-state'),true);
});
test('OAuth origins and calendar zones reject unsafe or invalid input',()=>{
 assert.equal(calendarOrigin('https://usemakocrm.com/'),'https://usemakocrm.com');
 assert.equal(calendarOrigin('http://127.0.0.1:3006'),'http://127.0.0.1:3006');
 assert.throws(()=>calendarOrigin('http://untrusted.example'));
 assert.throws(()=>calendarOrigin('javascript:alert(1)'));
 assert.ok(validTimeZone('America/Chicago'));assert.ok(validTimeZone('UTC'));
 assert.equal(validTimeZone('Fake/Place'),false);assert.equal(validTimeZone({}),false);
});
test('event export keeps stable tenant-bound IDs and excludes customer data',()=>{
 const item={id:'work-1',title:'Inspect equipment',kind:'Job',status:'Planned',scheduled_date:'2026-10-29',scheduled_time:'23:30:00',notes:'private customer note',customer_id:'customer-1'};
 const event=calendarEvent(item,'workspace-a','America/Chicago','https://usemakocrm.com');
 assert.match(event.id,/^[a-f0-9]{64}$/);assert.equal(event.id,eventId('workspace-a','work-1'));assert.notEqual(event.id,eventId('workspace-b','work-1'));
 assert.equal(event.start.dateTime,'2026-10-29T23:30:00');assert.equal(event.end.dateTime,'2026-10-30T00:30:00');assert.equal(event.start.timeZone,'America/Chicago');
 assert.ok(!JSON.stringify(event).includes('private customer note'));assert.ok(!JSON.stringify(event).includes('customer-1'));assert.equal(event.attendees,undefined);
 const moved=calendarEvent({...item,scheduled_date:'2026-11-02',status:'Cancelled'},'workspace-a','America/Chicago','https://usemakocrm.com');
 assert.equal(moved.id,event.id);assert.equal(moved.transparency,'transparent');assert.equal(moved.summary,'[Cancelled] Inspect equipment');
 const allDay=calendarEvent({...item,scheduled_date:'2026-12-31',scheduled_time:null},'workspace-a','UTC','https://usemakocrm.com');assert.equal(allDay.start.date,'2026-12-31');assert.equal(allDay.end.date,'2027-01-01');
});
test('calendar migration denies credential access to every browser role, including other workspace members',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.workspaces(id uuid primary key);grant usage on schema public to anon,authenticated,service_role;`);
  const sql=await readFile(new URL('../supabase/migrations/202610290014_google_calendar.sql',import.meta.url),'utf8');await db.exec(sql);
  await db.exec(await readFile(new URL('../supabase/migrations/202610290015_google_calendar_import.sql',import.meta.url),'utf8'));
  await db.exec(`insert into auth.users values('10000000-0000-4000-8000-000000000001');insert into workspaces values('20000000-0000-4000-8000-000000000001');set role service_role;insert into google_calendar_connections(workspace_id,user_id,refresh_token,time_zone) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','encrypted','UTC');reset role;`);
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from google_calendar_connections'),/permission denied/);await assert.rejects(db.query('delete from google_calendar_connections'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');const saved=(await db.query('select * from google_calendar_connections')).rows;assert.equal(saved.length,1);assert.equal(saved[0].scopes,'');assert.equal(saved[0].import_calendar_id,'primary');
 }finally{await db.close();}
});

