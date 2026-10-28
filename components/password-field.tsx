'use client';
import {useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
export function PasswordField(){const [visible,setVisible]=useState(false);return <label><span className="label-row"><span>Password</span><a href="/forgot-password">Forgot password?</a></span><div className="password-input"><input id="login-password" name="password" type={visible?'text':'password'} placeholder="Enter your password" autoComplete="current-password" required/><button type="button" className="password-toggle" aria-controls="login-password" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}<span>{visible?'Hide':'Show'}</span></button></div></label>;}
