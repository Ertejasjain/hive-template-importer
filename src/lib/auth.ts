/**
 * A single shared password in front of the app.
 *
 * This is deliberately not a user system — there are no accounts, and everyone
 * who gets in sees the same templates. It exists so the deployed URL is not
 * open to anyone who finds it. See NOTES.md for what real auth would look like.
 *
 * The session is a signed cookie, not the password itself: `<expiry>.<hmac>`.
 * Nothing derived from the password is ever sent to the browser, and the cookie
 * cannot be forged or extended without the signing secret.
 *
 * Written against Web Crypto so the same code runs in middleware (Edge) and in
 * server actions (Node).
 */

export const SESSION_COOKIE = 'template_importer_session';
const SESSION_DAYS = 7;

const encoder = new TextEncoder();

/** The app is only locked when a password is configured. */
export function isLockEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function signingSecret(): string {
  // AUTH_SECRET is preferred; falling back to the password keeps setup to one
  // variable, at the cost of invalidating sessions when the password changes —
  // which is the behaviour you want anyway.
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || '';
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

/** Compare without leaking how much of the value matched. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the submitted password is the configured one. */
export async function checkPassword(submitted: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  // Hash both sides first so the comparison is over fixed-length strings.
  const [a, b] = await Promise.all([hmac(submitted, 'pw'), hmac(expected, 'pw')]);
  return timingSafeEqual(a, b);
}

export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const expiresAt = String(Date.now() + maxAge * 1000);
  const signature = await hmac(expiresAt, signingSecret());
  return { value: `${expiresAt}.${signature}`, maxAge };
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expected = await hmac(expiresAt, signingSecret());
  if (!timingSafeEqual(signature, expected)) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}
