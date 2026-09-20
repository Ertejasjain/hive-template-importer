import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isLockEnabled, isValidSession } from '@/lib/auth';

/**
 * Everything is behind the password except the sign-in page itself and Next's
 * own static assets. Checking here rather than in each page means a route added
 * later is protected by default instead of by remembering to protect it.
 */
export async function middleware(request: NextRequest) {
  if (!isLockEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === '/login') return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  // Remember where they were headed, so a shared deep link still works.
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);

  // A server action that has lost its session must not be answered with an HTML
  // redirect — the client cannot use it. Refuse it and let the page reload.
  if (request.method === 'POST') {
    return new NextResponse('Your session has expired. Reload the page and sign in again.', {
      status: 401,
    });
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
