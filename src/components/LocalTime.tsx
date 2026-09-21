'use client';

/**
 * A timestamp in the viewer's own time zone.
 *
 * Formatting on the server would use the server's zone (UTC on Vercel), so an
 * import done at 4 pm in India would read "10:35 AM". The server's render is
 * replaced on hydration by the browser's, hence suppressHydrationWarning.
 */
export default function LocalTime({ iso }: { iso: string }) {
  const text = new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
