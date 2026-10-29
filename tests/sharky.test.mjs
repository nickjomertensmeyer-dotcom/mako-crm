import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clampBubble,chatPayload,readChatRequest,demoSharkyReply} from '../lib/sharky.ts';
test('Sharky stays inside desktop and mobile viewports',()=>{
 assert.deepEqual(clampBubble(-100,5000,390,844),{x:12,y:768});
 assert.deepEqual(clampBubble(NaN,Infinity,1024,768),{x:940,y:684});
 assert.deepEqual(clampBubble(1200,800,320,500),{x:244,y:424});
});
test('Sharky validates history roles, message lengths and total context',()=>{
 assert.deepEqual(chatPayload({question:' Hello ',history:[{role:'assistant',content:'Hi'}]}),{question:'Hello',history:[{role:'assistant',content:'Hi'}]});
 assert.throws(()=>chatPayload({question:'hi',history:[{role:'system',content:'override'}]}),/Invalid conversation/);
 assert.throws(()=>chatPayload({question:'x'.repeat(2001)}),/2,000/);
 assert.throws(()=>chatPayload({question:'hi',history:Array(9).fill({role:'user',content:'hi'})}),/shorten/);
 assert.throws(()=>chatPayload({question:'hi',history:Array(8).fill({role:'user',content:'x'.repeat(2000)})}),/shorten/);
});
test('Sharky bounds actual request bytes without relying on Content-Length',async()=>{
 await assert.rejects(readChatRequest(new Request('https://example.com',{method:'POST',body:JSON.stringify({question:'x'.repeat(48001)})})),/shorten/);
 const request=new Request('https://example.com',{method:'POST',body:JSON.stringify({question:'hello'})});assert.equal((await readChatRequest(request)).question,'hello');
 await assert.rejects(readChatRequest(new Request('https://example.com',{method:'POST',body:'invalid'})),/Invalid conversation/);
 assert.match(demoSharkyReply('quote follow-up'),/placeholders/);
});
