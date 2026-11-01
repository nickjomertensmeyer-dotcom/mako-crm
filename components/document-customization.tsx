'use client';
import {useRef,useState} from 'react';
import {documentFields,validDocumentLogo,type DocumentDesign} from '@/lib/document-design';
export function DocumentCustomization({initial={}}:{initial?:DocumentDesign}){
 const [logo,setLogo]=useState(initial.logo||''),[color,setColor]=useState(initial.color||'#2454ef'),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const sequence=useRef(0);
 async function upload(file?:File){
  if(!file)return;const version=++sequence.current;setError('');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Choose a PNG, JPEG, or WebP image under 5 MB.');return;}
  setLoading(true);
  try{const bitmap=await createImageBitmap(file);const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const result=canvas.toDataURL('image/png');if(!validDocumentLogo(result))throw new Error();if(version===sequence.current)setLogo(result);}catch{if(version===sequence.current)setError('Could not prepare this logo. Try a smaller image.');}finally{if(version===sequence.current)setLoading(false);}
 }
 return <details className="document-customization"><summary>Logo, colors & additional details</summary><div className="document-brand-controls"><div><label>Your business logo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label><small>Upload your own logo, or leave blank for no logo. PNG, JPEG, or WebP · up to 5 MB.</small>{loading&&<p role="status">Preparing logo…</p>}{logo&&<div className="document-logo-preview"><img src={logo} alt="Invoice logo preview"/><button type="button" className="secondary compact" onClick={()=>{sequence.current++;setLogo('');setLoading(false);}}>Remove logo</button></div>}<input type="hidden" name="design_preparing" value={loading?'1':'0'}/><input type="hidden" name="design_logo" value={logo}/></div><label>Border color<input type="color" name="design_color" value={color} onChange={e=>setColor(e.target.value)}/><span className="document-color-preview" style={{borderColor:color}}>Invoice border preview</span></label></div>{error&&<p className="notice error" role="alert">{error}</p>}<div className="form-grid">{documentFields.map(([key,label,max])=><label key={key}>{label}{max>=300?<textarea name={'design_'+key} maxLength={max} rows={2} defaultValue={initial[key]||''}/>:<input name={'design_'+key} type={key==='business_email'?'email':'text'} maxLength={max} defaultValue={initial[key]||''}/>}</label>)}</div><p className="small-copy muted">Optional fields are included on the invoice and PDF. Leave anything you don’t need blank.</p></details>;
}

