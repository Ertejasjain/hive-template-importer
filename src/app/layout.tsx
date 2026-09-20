import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isLockEnabled, isValidSession } from '@/lib/auth';
import { signOut } from '@/app/login/actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'Template Importer',
  description: 'Import a home inspection template from a Spectora export and edit it.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = isLockEnabled() && (await isValidSession(cookies().get(SESSION_COOKIE)?.value));

  return (
    <html lang="en">
      <body>
        <div className="topbar">
          <div className="inner">
            <Link href="/" className="mark" style={{ color: 'inherit' }}>
              Template Importer
            </Link>
            <span className="sub">home inspection templates</span>
            {signedIn && (
              <>
                <div className="spacer" />
                <form action={signOut}>
                  <button className="ghost small" type="submit">
                    Sign out
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
