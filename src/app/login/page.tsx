import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { SESSION_COOKIE, isLockEnabled, isValidSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  // With no password configured, or already signed in, there is nothing to do here.
  if (!isLockEnabled() || (await isValidSession(cookies().get(SESSION_COOKIE)?.value))) {
    redirect('/');
  }

  return (
    <div className="gate">
      <div className="card">
        <div className="pad">
          <h1 style={{ marginBottom: 4 }}>Template Importer</h1>
          <p className="muted small" style={{ margin: '0 0 18px' }}>
            This app is password protected. Enter the password to continue.
          </p>
          <LoginForm next={searchParams.next ?? '/'} />
        </div>
      </div>
    </div>
  );
}
