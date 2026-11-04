// Turns a plain-text Mako email into a simple, branded HTML version.
// The plain text is still sent alongside it, so every mail app can show the message.
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const linkRe=/https:\/\/[^\s<>"]+/g;
export function emailHtml(text:string,business:string){
 const paragraphs=text.trim().split(/\n{2,}/).map(block=>{
  const m=block.trim().match(/^(.*?):\s*(https:\/\/[^\s<>"]+)$/s);
  if(m&&/\/invoice\/[0-9a-f]{64}$/.test(m[2]))return `<p style="margin:24px 0"><a href="${esc(m[2])}" style="background:#1f5eff;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:8px;display:inline-block">${esc(m[1])}</a></p>`;
  const html=esc(block.trim()).replace(linkRe,u=>`<a href="${u}" style="color:#1f5eff">${u}</a>`).replaceAll('\n','<br>');
  return `<p style="margin:0 0 16px;line-height:1.55">${html}</p>`;
 }).join('');
 return `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#13213d"><div style="max-width:600px;margin:0 auto;padding:24px 16px"><div style="background:linear-gradient(90deg,#1f5eff,#18c4e6);height:6px;border-radius:6px 6px 0 0"></div><div style="background:#ffffff;padding:28px;border-radius:0 0 8px 8px;font-size:15px"><p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b8c;font-weight:700">${esc(business)}</p>${paragraphs}</div><p style="text-align:center;font-size:12px;color:#8190ab;margin:16px 0 0">Sent for ${esc(business)} through Mako CRM</p></div></body></html>`;
}
