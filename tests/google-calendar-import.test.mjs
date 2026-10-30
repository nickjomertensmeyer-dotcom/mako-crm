import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarWindow,normalizeGoogleEvent,googleEventsOnDay} from '../lib/google-calendar-model.ts';
import {canReadGoogleCalendar,calendarScope} from '../lib/google-calendar-security.ts';
test('old write-only Google grants cannot read personal calendars; both new permissions are required',()=>{
 assert.equal(canReadGoogleCalendar('https://www.googleapis.com/auth/calendar.app.created'),false);
 assert.equal(canReadGoogleCalendar(calendarScope),true);
 assert.equal(canReadGoogleCalendar(calendarScope.split(' ')[0]),false);
});
test('timed Google events use the chosen zone and exclusive end across midnight and DST',()=>{
 const event=normalizeGoogleEvent({id:'g1',summary:'Client call',start:{dateTime:'2026-10-30T04:30:00Z'},end:{dateTime:'2026-10-30T05:00:00Z'},htmlLink:'https://calendar.google.com/calendar/event?eid=fixture'},'America/Chicago');
 assert.equal(event.date,'2026-10-29');assert.equal(event.time,'23:30');assert.equal(event.through,'2026-10-29');assert.equal(event.endLabel,'2026-10-30 00:00');
 const dst=normalizeGoogleEvent({id:'dst',start:{dateTime:'2026-11-01T07:30:00Z'},end:{dateTime:'2026-11-01T08:30:00Z'}},'America/Chicago');assert.equal(dst.time,'01:30');assert.equal(dst.endLabel,'02:30');assert.equal(dst.title,'Busy / private event');
});
test('multi-day all-day events appear on each covered day without spilling past exclusive end',()=>{
 const event=normalizeGoogleEvent({id:'holiday',summary:'Away',start:{date:'2026-10-29'},end:{date:'2026-11-02'}},'America/Chicago');assert.equal(event.through,'2026-11-01');
 assert.equal(googleEventsOnDay([event],'2026-10-29').length,1);assert.equal(googleEventsOnDay([event],'2026-11-01').length,1);assert.equal(googleEventsOnDay([event],'2026-11-02').length,0);
});
test('cancelled/malformed events are ignored and external links are restricted to Google',()=>{
 const fixture={id:'one',start:{date:'2026-10-29'},end:{date:'2026-10-30'}};
 assert.equal(normalizeGoogleEvent({...fixture,status:'cancelled'},'UTC'),null);
 assert.equal(normalizeGoogleEvent({...fixture,start:{dateTime:'broken'}},'UTC'),null);
 assert.equal(normalizeGoogleEvent({...fixture,htmlLink:'javascript:alert(1)'},'UTC').url,undefined);
 assert.equal(normalizeGoogleEvent({...fixture,htmlLink:'https://attacker.example/'},'UTC').url,undefined);
 assert.equal(normalizeGoogleEvent({...fixture,description:'sensitive note',attendees:[{email:'private@example.com'}]},'UTC').description,undefined);
});
test('Google fetch covers the calendar six-week grid and validates date-range input',()=>{
 const window=calendarWindow('2026-10');assert.equal(window.timeMin,'2026-09-26T00:00:00.000Z');assert.equal(window.timeMax,'2026-11-09T00:00:00.000Z');
 for(const invalid of ['2026-13','bad','1969-01','2101-01','2026-10&calendar=other'])assert.throws(()=>calendarWindow(invalid));
});
