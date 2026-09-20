'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { signIn, type SignInState } from '@/app/login/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" style={{ width: '100%' }} disabled={pending}>
      {pending ? 'Checking…' : 'Unlock'}
    </button>
  );
}

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useFormState<SignInState, FormData>(signIn, { error: null });

  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
        />
      </label>
      <SubmitButton />
      {state.error && (
        <div className="banner err" style={{ marginTop: 14, marginBottom: 0 }}>
          {state.error}
        </div>
      )}
    </form>
  );
}
