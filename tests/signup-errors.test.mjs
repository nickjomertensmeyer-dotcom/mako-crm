import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signupError,resendError} from '../lib/signup-errors.ts';

test('resend feedback handles throttling without revealing registered accounts',()=>{
 assert.match(resendError({status:429}),/limiting requests/);
 assert.match(resendError({code:'over_email_send_rate_limit'}),/Wait a few minutes/);
 assert.equal(resendError({code:'user_not_found'}),resendError({code:'email_confirmed'}));
 assert.match(resendError({status:500}),/try again later/);
});
test('signup errors identify configuration and email limits without exposing account data',()=>{
 assert.match(signupError({code:'email_address_not_authorized'}),/configure an email provider in Supabase/);
 assert.match(signupError({code:'over_email_send_rate_limit'}),/confirmation-email limit/);
 assert.match(signupError({code:'signup_disabled'}),/disabled in Supabase/);
 assert.match(signupError({code:'email_address_invalid'}),/real, valid email/);
 assert.match(signupError({code:'weak_password'}),/stronger password/);
 assert.match(signupError({status:429}),/rate-limited/);
 assert.match(signupError({status:500}),/authentication logs/);
 assert.equal(signupError({code:'user_already_exists'}),signupError({code:'unexpected_unknown_code'}),'do not reveal account existence');
});
