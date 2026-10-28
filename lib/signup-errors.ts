// Only provider codes/statuses are used. Never echo a raw error containing user data.
export function resendError(error:{code?:string;status?:number}):string {
 if(error.status===429||['over_email_send_rate_limit','over_request_rate_limit','over_email_send_rate_limit_per_user'].includes(error.code||''))return 'The email service is limiting requests. Wait a few minutes before trying again.';
 return 'We couldn’t send another confirmation email. Please try again later or contact Mako. If you already confirmed your email, sign in or reset your password.';
}
export function signupError(error:{code?:string;status?:number}):string {
  switch(error.code){
    case 'email_address_not_authorized': return 'Confirmation emails are not connected for public signup yet. Mako needs to configure an email provider in Supabase before new customers can register.';
    case 'over_email_send_rate_limit': return 'The confirmation-email limit has been reached. Please wait before trying again. Mako needs to configure an email provider for reliable signup.';
    case 'signup_disabled': return 'New account registration is currently disabled in Supabase. Mako needs to enable email signups.';
    case 'email_provider_disabled': case 'provider_disabled': return 'Email account registration is not enabled. Please contact Mako.';
    case 'email_address_invalid': return 'Use a real, valid email address. Example and test-only email domains are not supported.';
    case 'weak_password': return 'Choose a stronger password with at least 12 characters, including uppercase and lowercase letters, a number, and a symbol.';
    case 'captcha_failed': return 'Signup verification could not complete. Mako needs to check the CAPTCHA configuration.';
    case 'over_request_rate_limit': case 'over_email_send_rate_limit_per_user': return 'Too many signup attempts. Please wait a few minutes before trying again.';
    case 'hook_timeout': case 'hook_timeout_after_retry': case 'email_send_failed': return 'Your confirmation email could not be sent. Please try again later or contact Mako.';
    default:
      if(error.status===429)return 'Signup is temporarily rate-limited. Please wait before trying again.';
      if(error.status && error.status>=500)return 'The account service could not complete signup. Mako needs to check the authentication logs and email delivery settings.';
      return 'We couldn’t finish signup. If you already registered, sign in or reset your password. Otherwise, contact Mako for help.';
  }
}
