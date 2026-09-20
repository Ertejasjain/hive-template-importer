'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, checkPassword, createSession } from '@/lib/auth';

export type SignInState = { error: string | null };

/** Only allow redirects back into this app, never to another site. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? '');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const password = String(formData.get('password') ?? '');
  if (!password) return { error: 'Enter the password.' };

  if (!(await checkPassword(password))) {
    // Slow a wrong answer down a little, so the page cannot be brute-forced at
    // full speed. It is not a rate limiter, but it is not free either.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: 'That password is not right.' };
  }

  const session = await createSession();
  cookies().set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.maxAge,
  });

  redirect(safeNext(formData.get('next')));
}

export async function signOut() {
  cookies().delete(SESSION_COOKIE);
  redirect('/login');
}
