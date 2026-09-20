import Link from 'next/link';
import { notFound } from 'next/navigation';
import ImportReport from '@/components/ImportReport';
import TemplateEditor from '@/components/TemplateEditor';
import { getLatestImportRun, getTemplate } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { imported?: string };
}) {
  const template = await getTemplate(params.id);
  if (!template) notFound();

  const run = await getLatestImportRun(params.id);

  return (
    <>
      <div className="small muted" style={{ marginBottom: 10 }}>
        <Link href="/">← All templates</Link>
      </div>

      {run && <ImportReport run={run} highlight={searchParams.imported === '1'} />}

      <TemplateEditor template={template} />
    </>
  );
}
