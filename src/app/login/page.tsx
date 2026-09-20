import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { isLockEnabled } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  // With no password configured there is nothing to sign in to.
  if (!isLockEnabled()) redirect('/');

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
