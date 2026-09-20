'use client';

import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { uploadTemplate, type UploadState } from '@/app/actions';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={disabled || pending}>
      {pending ? 'Importing…' : 'Import template'}
    </button>
  );
}

export default function UploadForm() {
  const [state, formAction] = useFormState<UploadState, FormData>(uploadTemplate, { error: null });
  const [filename, setFilename] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function takeFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (inputRef.current) {
      // Assigning a DataTransfer list is the only way to put a dropped file
      // into a real <input type="file">, which is what the form posts.
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      inputRef.current.files = dt.files;
    }
    setFilename(files[0].name);
  }

  return (
    <form action={formAction}>
      <div
        className={over ? 'dropzone over' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          takeFiles(e.dataTransfer.files);
        }}
      >
        <div>
          <button type="button" onClick={() => inputRef.current?.click()}>
            Choose a file
          </button>{' '}
          or drag it here
        </div>
        <div className="hint">Spectora template export &middot; .xls, .xlsx or .csv &middot; up to 8 MB</div>
        {filename && <div className="filename">{filename}</div>}
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".xls,.xlsx,.xlsm,.csv"
          hidden
          onChange={(e) => takeFiles(e.target.files)}
        />
        <div style={{ marginTop: 16 }}>
          <SubmitButton disabled={!filename} />
        </div>
      </div>

      {state.error && (
        <div className="banner err" style={{ marginTop: 12, marginBottom: 0 }}>
          {state.error}
        </div>
      )}
    </form>
  );
}
