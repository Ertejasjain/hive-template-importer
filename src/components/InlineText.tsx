'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A name that looks like text until you click it. Saves on blur or Enter,
 * reverts on Escape, and refuses to save an empty name (an unnamed section is
 * worse than the original one).
 */
export default function InlineText({
  value,
  onSave,
  style,
  ariaLabel,
}: {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  style?: React.CSSProperties;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const committed = useRef(value);

  useEffect(() => {
    committed.current = value;
    setDraft(value);
  }, [value]);

  async function commit() {
    const next = draft.trim();
    if (!next) {
      setDraft(committed.current);
      return;
    }
    if (next === committed.current) return;
    setSaving(true);
    try {
      await onSave(next);
      committed.current = next;
    } catch {
      setDraft(committed.current);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type="text"
      className="inline-input"
      aria-label={ariaLabel}
      style={{ ...style, opacity: saving ? 0.6 : 1 }}
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(committed.current);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
