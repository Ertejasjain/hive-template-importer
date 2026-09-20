import Link from 'next/link';
import UploadForm from '@/components/UploadForm';
import TemplateActions from '@/components/TemplateActions';
import { listTemplates } from '@/lib/db';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <h1>Template Importer</h1>
        <div className="banner err">
          <strong>Supabase is not configured.</strong> Copy <code>.env.example</code> to{' '}
          <code>.env.local</code>, fill in your project URL and key, run{' '}
          <code>supabase/schema.sql</code> in the SQL editor, then restart the dev server. The README
          has the full walkthrough.
        </div>
      </>
    );
  }

  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let loadError: string | null = null;
  try {
    templates = await listTemplates();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <h1>Templates</h1>
      <p className="lede">
        Upload a template export from Spectora and it becomes an editable template here: sections,
        items and comments, in the order the inspector put them in.
      </p>

      <UploadForm />

      {loadError && (
        <div className="banner err mt">
          Could not load templates: {loadError}
          <div className="small" style={{ marginTop: 6 }}>
            If this mentions a missing relation, the schema has not been run yet. See the README.
          </div>
        </div>
      )}

      <div className="card mt">
        {templates.length === 0 && !loadError ? (
          <div className="empty">No templates yet. Upload an export above to get started.</div>
        ) : (
          templates.map((t) => (
            <div className="tpl-row" key={t.id}>
              <div className="grow">
                <div className="name">
                  <Link href={`/templates/${t.id}`}>{t.name}</Link>
                </div>
                <div className="meta">
                  {t.counts.sections} sections &middot; {t.counts.items} items &middot;{' '}
                  {t.counts.comments} comments &middot; added {when(t.created_at)}
                </div>
              </div>
              <TemplateActions id={t.id} name={t.name} />
            </div>
          ))
        )}
      </div>
    </>
  );
}
