'use client';

import { useEffect, useState } from 'react';

/**
 * A timestamp in the viewer's own time zone.
 *
 * The server runs in UTC on Vercel, so formatting there would make a 4 pm
 * import in India read "10:35 AM". React also keeps server-rendered text when it
 * hydrates, so the only reliable fix is to format after the component mounts in
 * the browser, where the viewer's time zone is known.
 */
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(
      new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, [iso]);

  return <time dateTime={iso}>{text ?? ''}</time>;
}
