'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function ResetPasswordField({ name, label }: { name: 'password' | 'confirm'; label: string }) {
  const [visible, setVisible] = useState(false);
  const id = `reset-${name}`;

  return <div>
    <label htmlFor={id}>{label}</label>
    <div className="password-input">
      <input id={id} name={name} type={visible ? 'text' : 'password'} minLength={12} maxLength={128} autoComplete="new-password" required />
      <button type="button" className="password-toggle" aria-controls={id} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        <span>{visible ? 'Hide' : 'Show'}</span>
      </button>
    </div>
  </div>;
}
