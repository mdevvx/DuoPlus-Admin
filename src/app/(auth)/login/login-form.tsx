'use client';

import { useActionState } from 'react';
import { signInWithPassword, type FormState } from '../actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signInWithPassword, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium">Email</span>
        <input className="input h-10" name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium">Password</span>
        <input className="input h-10" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && <p role="alert" className="text-danger">{state.error}</p>}
      <button className="btn btn-primary h-10 w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
