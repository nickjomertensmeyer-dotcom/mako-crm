import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emailConfirmation,confirmationDestination} from '../lib/email-confirmation.ts';
test('email confirmations accept only supported tokens and fixed destinations',()=>{
 for(const type of ['email','recovery','invite'])assert.equal(emailConfirmation('a'.repeat(64),type).type,type);
 for(const hash of ['',null,'https://evil.test',{},'a'.repeat(257)])assert.equal(emailConfirmation(hash,'email'),null);
 assert.equal(emailConfirmation('a'.repeat(64),'https://evil.test'),null);
 assert.equal(confirmationDestination('recovery',true),'/reset-password');
 assert.equal(confirmationDestination('email',true),'/pilot');
 assert.equal(confirmationDestination('email',false),'/workspace');
});
test('email landing never consumes a token on GET and templates bypass browser-bound code exchange',async()=>{
 const page=await readFile(new URL('../app/auth/confirm/page.tsx',import.meta.url),'utf8');
 assert.ok(!page.includes('verifyOtp'));assert.ok(page.includes('action={confirmEmailLink}'));
 for(const name of ['confirm-signup','reset-password']){
 const html=await readFile(new URL(`../supabase/templates/${name}.html`,import.meta.url),'utf8');
 assert.ok(html.includes('{{ .TokenHash }}'));assert.ok(!html.includes('{{ .ConfirmationURL }}'));
 }
});
