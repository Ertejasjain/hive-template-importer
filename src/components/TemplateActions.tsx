'use client';

import { useTransition } from 'react';
import { copyTemplate, deleteTemplate } from '@/app/actions';

export default function TemplateActions({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();

  return (
    <div className="row">
      <button
        disabled={pending}
        onClick={() => start(() => void copyTemplate(id))}
        title="Make an independent copy of this template"
      >
        {pending ? 'Working…' : 'Duplicate'}
      </button>
      <button
        className="danger"
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete "${name}" and everything in it? This cannot be undone.`)) {
            start(() => void deleteTemplate(id));
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}
