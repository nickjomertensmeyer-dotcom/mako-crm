export const GOOGLE_AUTH_COOKIE='mako-google-auth';
export function googleAuthCallback(site:string|undefined){
 if(!site)throw new Error('Site URL is not configured');
 const origin=new URL(site);
 if(origin.username||origin.password||(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname))))throw new Error('Invalid site URL');
 const callback=new URL('/auth/callback',origin.origin);
 return callback.toString();
}
export function googleAuthFailure(intent:string|null){
 const path=intent==='signup'?'/signup':'/login';
 return path+'?message='+encodeURIComponent('Google sign-in could not be completed. Please try again or continue with email.');
}
