import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDocumentDesign,validDocumentLogo} from '../lib/document-design.ts';
test('document design validates safe printable fields and rejects remote or active logos',()=>{
 assert.equal(validateDocumentDesign({color:'#2454ef',reference:'PO-45',business_email:'team@example.com'}),'');
 assert.equal(validateDocumentDesign({}),'');
 assert.notEqual(validateDocumentDesign({color:'red;display:none'}),'');
 assert.notEqual(validateDocumentDesign({business_email:'incomplete@'}),'');
 assert.notEqual(validateDocumentDesign({payment_terms:'a'.repeat(501)}),'');
 for(const logo of ['https://example.com/a.png','data:image/svg+xml,<svg/>','data:image/png;base64,broken'])assert.equal(validDocumentLogo(logo),false);
});
