import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deleteGoogleEvent} from '../lib/google-calendar-delete.ts';
import {canReadGoogleCalendar,canEditGoogleCalendar,calendarScope} from '../lib/google-calendar-security.ts';
test('read-only grants remain readable but cannot delete',()=>{
 const old='https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly';
 assert.equal(canReadGoogleCalendar(old),true);assert.equal(canEditGoogleCalendar(old),false);assert.equal(canEditGoogleCalendar(calendarScope),true);
});
test('single occurrence deletion uses conditional request and sends cancellation updates',async()=>{
 const calls=[];await deleteGoogleEvent({id:'instance_20261030',etag:'"v1"',scope:'occurrence'},async(path,method,etag)=>{calls.push({path,method,etag});return {etag:'"v1"',recurringEventId:'parent'};});
 assert.deepEqual(calls[1],{path:'events/instance_20261030?sendUpdates=all',method:'DELETE',etag:'"v1"'});
});
test('series target comes from Google, with the parent etag',async()=>{
 const calls=[];await deleteGoogleEvent({id:'instance',etag:'one',scope:'series'},async(path,method,etag)=>{calls.push({path,method,etag});return path==='events/instance'?{etag:'one',recurringEventId:'trustedParent'}:{etag:'parentVersion',recurrence:['RRULE:FREQ=WEEKLY']};});
 assert.deepEqual(calls[2],{path:'events/trustedParent?sendUpdates=all',method:'DELETE',etag:'parentVersion'});
});
test('invalid, locked, changed, and non-recurring series requests never issue deletion',async()=>{
 for(const [id,event,scope] of [['../bad',{},'occurrence'],['good',{etag:'old'},'occurrence'],['good',{etag:'current',locked:true},'occurrence'],['good',{etag:'current'},'series']]){
  const methods=[];await assert.rejects(deleteGoogleEvent({id,etag:'current',scope},async(path,method)=>{methods.push(method);return event;}));assert.ok(!methods.includes('DELETE'));
 }
});
test('cancelled event retries do nothing; provider failures are surfaced',async()=>{
 let calls=0;await deleteGoogleEvent({id:'gone',etag:'old',scope:'occurrence'},async()=>{calls++;return {status:'cancelled'};});assert.equal(calls,1);
 await assert.rejects(deleteGoogleEvent({id:'good',etag:'v1',scope:'occurrence'},async(path,method)=>{if(method==='DELETE')throw new Error('provider unavailable');return {etag:'v1'};}),/provider unavailable/);
});
