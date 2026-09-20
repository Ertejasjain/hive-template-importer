'use client';

import { useState } from 'react';
import type { ImportRunRow } from '@/lib/db';

/**
 * The import report.
 *
 * An inspector's template is their livelihood, so "it imported" is not good
 * enough - they need to know whether all of it imported. This panel reconciles
 * the rows in the file against what is now in the database, and lists every row
 * that was skipped or changed, with its spreadsheet row number so it can be
 * looked up in Excel.
 */
export default function ImportReport({
  run,
  highlight,
}: {
  run: ImportRunRow;
  highlight: boolean;
}) {
  const issues = run.issues ?? [];
  const skipped = issues.filter((i) => i.severity === 'skipped');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const [open, setOpen] = useState(highlight && issues.length > 0);

  const clean = run.rows_skipped === 0 && run.status === 'success';

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="pad">
        <div className="row wrap" style={{ marginBottom: 12 }}>
          <h2>Import report</h2>
          <span className="tag plain">{run.filename}</span>
          <div className="spacer" />
          {issues.length > 0 && (
            <button className="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide details' : `Show ${issues.length} note${issues.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        <div className={clean ? 'banner ok' : 'banner warn'}>
          {clean ? (
            <>
              All {run.rows_total} rows in the file were imported. Nothing was dropped.
            </>
          ) : (
            <>
              {run.rows_imported} of {run.rows_total} rows were imported
              {run.rows_skipped > 0 && <>, {run.rows_skipped} could not be</>}
              {warnings.length > 0 && <>, and {warnings.length} needed a change</>}. The details are
              below so you can check them against the original file.
            </>
          )}
        </div>

        <div className="stats">
          <div className="stat">
            <div className="n">{run.rows_total}</div>
            <div className="l">rows in file</div>
          </div>
          <div className="stat">
            <div className="n">{run.sections_count}</div>
            <div className="l">sections</div>
          </div>
          <div className="stat">
            <div className="n">{run.items_count}</div>
            <div className="l">items</div>
          </div>
          <div className="stat">
            <div className="n">{run.comments_count}</div>
            <div className="l">comments</div>
          </div>
          <div className="stat">
            <div className="n" style={{ color: run.rows_skipped ? 'var(--danger)' : undefined }}>
              {run.rows_skipped}
            </div>
            <div className="l">skipped</div>
          </div>
        </div>

        {open && issues.length > 0 && (
          <div className="mt">
            {skipped.length > 0 && (
              <>
                <div className="small" style={{ fontWeight: 650, marginBottom: 4 }}>
                  Not imported ({skipped.length})
                </div>
                <div style={{ marginBottom: 14 }}>
                  {skipped.map((i) => (
                    <div className="issue" key={i.id}>
                      <span className="tag high">row {i.source_row ?? '—'}</span>
                      <span>{i.message}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {warnings.length > 0 && (
              <>
                <div className="small" style={{ fontWeight: 650, marginBottom: 4 }}>
                  Imported with a change ({warnings.length})
                </div>
                <div>
                  {warnings.map((i) => (
                    <div className="issue" key={i.id}>
                      <span className="tag medium">
                        {i.source_row ? `row ${i.source_row}` : 'file'}
                      </span>
                      <span>{i.message}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
