import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleAuthCallback,googleAuthFailure} from '../lib/google-auth.ts';
test('Google auth callbacks stay on the configured site and accept only fixed flow intents',()=>{
 assert.equal(googleAuthCallback('https://usemakocrm.com'),'https://usemakocrm.com/auth/callback');
 assert.equal(googleAuthCallback('http://localhost:3000'),'http://localhost:3000/auth/callback');
 assert.equal(googleAuthCallback('https://usemakocrm.com/path'),'https://usemakocrm.com/auth/callback');
 for(const site of [undefined,'javascript:alert(1)','http://example.com','https://user:password@example.com'])assert.throws(()=>googleAuthCallback(site));
 assert.ok(googleAuthFailure('signup').startsWith('/signup?message='));
 assert.ok(googleAuthFailure('//evil.test').startsWith('/login?message='));
});
