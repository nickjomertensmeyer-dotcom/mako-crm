import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finHelpReply} from '../lib/fin-help.ts';
test('recognizes common variants and specific intent before broad topic',()=>{
 for(const q of ['add a prospect','How do I create leads?','pipeline stages']) assert.match(finHelpReply(q),/Open Leads/);
 assert.match(finHelpReply('my customer email is invalid'),/red error box/);
 assert.match(finHelpReply('change my company logo'),/Business logo/);
 assert.match(finHelpReply('draft a quote follow-up'),/placeholders/);
 assert.match(finHelpReply('create an invoice'),/Open Invoices/);
 assert.match(finHelpReply('plan my day'),/overdue tasks/);
 assert.match(finHelpReply('cancel my subscription'),/Plan & data/);
 assert.match(finHelpReply('calender'),/Open Schedule/);
});
test('does not invent answers or claim actions',()=>{
 assert.match(finHelpReply('what is the weather in Tokyo'),/reliable prepared answer/);
 assert.match(finHelpReply('send a quote follow-up'),/not sent anything/);
 assert.match(finHelpReply('hello'),/prepared answers, not live AI/);
});
