import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quickBooksCallback,quickBooksRealm,quickBooksEnvironment,qbContact,validQuickBooksState} from '../lib/quickbooks-model.ts';

test('OAuth state rejects CSRF substitutions, expired sessions, changed environments and malformed bindings',()=>{
 const now=Date.now(),nonce='a'.repeat(43),state={state:nonce,uid:'10000000-0000-4000-8000-000000000001',wid:'20000000-0000-4000-8000-000000000001',environment:'sandbox',expires:now+600000};
 assert.equal(validQuickBooksState(state,nonce,'sandbox',now),true);
 for(const [saved,input,environment] of [[state,'b'.repeat(43),'sandbox'],[state,nonce,'production'],[{...state,expires:now-1},nonce,'sandbox'],[{...state,expires:Infinity},nonce,'sandbox'],[{...state,expires:now+3600000},nonce,'sandbox'],[{...state,uid:'other'},nonce,'sandbox'],[{...state,wid:''},nonce,'sandbox'],[null,nonce,'sandbox'],[state,null,'sandbox']])assert.equal(validQuickBooksState(saved,input,environment,now),false);
});
test('QuickBooks explicitly separates sandbox from production and rejects IP callbacks',()=>{
 assert.equal(quickBooksEnvironment('sandbox'),'sandbox');assert.equal(quickBooksEnvironment('production'),'production');assert.throws(()=>quickBooksEnvironment(undefined));assert.throws(()=>quickBooksEnvironment('live'));
 assert.equal(quickBooksCallback('http://localhost:3008'),'http://localhost:3008/api/quickbooks/callback');assert.equal(quickBooksCallback('https://usemakocrm.com'),'https://usemakocrm.com/api/quickbooks/callback');assert.throws(()=>quickBooksCallback('http://127.0.0.1:3007'));assert.throws(()=>quickBooksCallback('http://untrusted.example'));
 for(const realm of ['../company','1?query=private','https://other.example',null,''])assert.equal(quickBooksRealm(realm),false);assert.equal(quickBooksRealm('123456789'),true);
});
test('QuickBooks contact mappings validate IDs and fields without changing CRM records',()=>{
 assert.equal(qbContact({Id:'../../other',DisplayName:'Other'}),null);assert.equal(qbContact({Id:'12'}),null);
 assert.deepEqual(qbContact({Id:'12',DisplayName:'Fictional customer',PrimaryEmailAddr:{Address:'bad address'},PrimaryPhone:{FreeFormNumber:'123'},CompanyName:'Example'}),{externalId:'12',name:'Fictional customer',email:'',phone:'123',company:'Example'});
});
