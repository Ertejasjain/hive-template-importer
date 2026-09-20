import 'server-only';
import { getSupabase } from './supabase';
import type { ImportIssue, ParseResult } from './types';

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  item_id: string;
  name: string;
  body_html: string;
  body_text: string;
  comment_type: 'info' | 'limitation' | 'defect';
  severity: 'low' | 'medium' | 'high' | null;
  recommendation: string | null;
  answer_type: string | null;
  choices: string[];
  unit_types: string[];
  default_value: string | null;
  default_value_2: string | null;
  default_unit_type: string | null;
  default_location: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  locked: boolean;
  simple_format: boolean;
  disable_photos: boolean;
  uses: number;
  photos: { url: string; caption: string }[];
  position: number;
  source_row: number | null;
}

export interface ItemRow {
  id: string;
  section_id: string;
  name: string;
  position: number;
  comments: CommentRow[];
}

export interface SectionRow {
  id: string;
  template_id: string;
  name: string;
  position: number;
  items: ItemRow[];
}

export interface TemplateTree extends TemplateRow {
  sections: SectionRow[];
}

export interface ImportRunRow {
  id: string;
  template_id: string | null;
  filename: string;
  file_size: number | null;
  status: 'success' | 'partial' | 'failed';
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  sections_count: number;
  items_count: number;
  comments_count: number;
  error_message: string | null;
  created_at: string;
  issues?: ImportIssueRow[];
}

export interface ImportIssueRow {
  id: string;
  severity: 'warning' | 'skipped';
  code: string;
  message: string;
  source_row: number | null;
  column_name: string | null;
  raw_value: string | null;
}

/** Supabase rejects very large single requests, so writes go out in batches. */
const BATCH = 250;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres raises on a malformed uuid rather than returning nothing, so a
 * mistyped or stale URL would surface as a crash. Treat anything that is not a
 * uuid as simply not found.
 */
function isId(value: string): boolean {
  return UUID.test(value);
}

async function insertMany(
  table: string,
  rows: Record<string, unknown>[],
  returning = 'id',
): Promise<{ id: string }[]> {
  const supabase = getSupabase();
  const out: { id: string }[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { data, error } = await supabase.from(table).insert(chunk).select(returning);
    if (error) throw new Error(`Could not save ${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as { id: string }[]));
  }
  return out;
}

/**
 * Write a parsed template to the database.
 *
 * Postgres has no cheap way to do this in one statement from the JS client, so
 * it is three ordered bulk inserts (sections, then items, then comments). If any
 * of them fails the template row is deleted, which cascades, so a half-imported
 * template is never left behind - and the failure is still recorded as an
 * import run so the user sees what happened.
 */
export async function importTemplate(
  parsed: ParseResult,
  filename: string,
  fileSize: number,
): Promise<{ templateId: string; runId: string }> {
  const supabase = getSupabase();

  const { data: template, error: templateError } = await supabase
    .from('templates')
    .insert({ name: parsed.templateName, source_file: filename, source_format: 'spectora' })
    .select('id')
    .single();

  if (templateError || !template) {
    throw new Error(`Could not create the template: ${templateError?.message ?? 'unknown error'}`);
  }

  const templateId = template.id as string;

  try {
    const sectionIds = await insertMany(
      'sections',
      parsed.sections.map((s) => ({ template_id: templateId, name: s.name, position: s.position })),
    );

    const itemRows: Record<string, unknown>[] = [];
    parsed.sections.forEach((section, si) => {
      section.items.forEach((item) => {
        itemRows.push({ section_id: sectionIds[si].id, name: item.name, position: item.position });
      });
    });
    const itemIds = await insertMany('items', itemRows);

    const commentRows: Record<string, unknown>[] = [];
    let cursor = 0;
    parsed.sections.forEach((section) => {
      section.items.forEach((item) => {
        const itemId = itemIds[cursor].id;
        cursor += 1;
        item.comments.forEach((c) => {
          commentRows.push({ item_id: itemId, ...c });
        });
      });
    });
    await insertMany('comments', commentRows, 'id');

    const runId = await recordRun(templateId, filename, fileSize, parsed, null);
    return { templateId, runId };
  } catch (err) {
    await supabase.from('templates').delete().eq('id', templateId);
    const message = err instanceof Error ? err.message : String(err);
    await recordRun(null, filename, fileSize, parsed, message);
    throw new Error(message);
  }
}

async function recordRun(
  templateId: string | null,
  filename: string,
  fileSize: number,
  parsed: ParseResult,
  errorMessage: string | null,
): Promise<string> {
  const supabase = getSupabase();
  const status = errorMessage ? 'failed' : parsed.stats.rowsSkipped > 0 ? 'partial' : 'success';

  const { data, error } = await supabase
    .from('import_runs')
    .insert({
      template_id: templateId,
      filename,
      file_size: fileSize,
      status,
      rows_total: parsed.stats.rowsTotal,
      rows_imported: errorMessage ? 0 : parsed.stats.rowsImported,
      rows_skipped: parsed.stats.rowsSkipped,
      sections_count: errorMessage ? 0 : parsed.stats.sections,
      items_count: errorMessage ? 0 : parsed.stats.items,
      comments_count: errorMessage ? 0 : parsed.stats.comments,
      error_message: errorMessage,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Could not record the import: ${error?.message}`);
  const runId = data.id as string;

  if (parsed.issues.length) {
    await insertMany(
      'import_issues',
      parsed.issues.map((issue: ImportIssue) => ({
        import_run_id: runId,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        source_row: issue.source_row ?? null,
        column_name: issue.column_name ?? null,
        raw_value: issue.raw_value ?? null,
      })),
    );
  }

  return runId;
}

export async function listTemplates(): Promise<(TemplateRow & { counts: { sections: number; items: number; comments: number } })[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('templates')
    .select('id, name, description, source_file, created_at, updated_at, sections(id, items(id, comments(id)))')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  type Nested = TemplateRow & { sections: { id: string; items: { id: string; comments: { id: string }[] }[] }[] };

  return ((data ?? []) as unknown as Nested[]).map((t) => {
    const items = t.sections.flatMap((s) => s.items);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      source_file: t.source_file,
      created_at: t.created_at,
      updated_at: t.updated_at,
      counts: {
        sections: t.sections.length,
        items: items.length,
        comments: items.reduce((n, i) => n + i.comments.length, 0),
      },
    };
  });
}

export async function getTemplate(id: string): Promise<TemplateTree | null> {
  if (!isId(id)) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('templates')
    .select(
      'id, name, description, source_file, created_at, updated_at, sections(*, items(*, comments(*)))',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const tree = data as unknown as TemplateTree;
  // Supabase does not guarantee the order of embedded rows, and the order here
  // is part of the template's meaning, so sort explicitly.
  tree.sections.sort((a, b) => a.position - b.position);
  for (const section of tree.sections) {
    section.items.sort((a, b) => a.position - b.position);
    for (const item of section.items) item.comments.sort((a, b) => a.position - b.position);
  }
  return tree;
}

export async function getLatestImportRun(templateId: string): Promise<ImportRunRow | null> {
  if (!isId(templateId)) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('import_runs')
    .select('*, import_issues(*)')
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as ImportRunRow & { import_issues: ImportIssueRow[] };
  return { ...row, issues: row.import_issues ?? [] };
}

export async function updateRow(
  table: 'templates' | 'sections' | 'items' | 'comments',
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRow(
  table: 'templates' | 'sections' | 'items' | 'comments',
  id: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Copy a template, including every section, item and comment, and their order.
 * The copy is completely independent: editing it never touches the original.
 */
export async function duplicateTemplate(id: string, newName?: string): Promise<string> {
  const source = await getTemplate(id);
  if (!source) throw new Error('That template no longer exists.');

  const supabase = getSupabase();
  const { data: template, error } = await supabase
    .from('templates')
    .insert({
      name: newName?.trim() || `${source.name} (copy)`,
      description: source.description,
      source_file: source.source_file,
      source_format: 'copy',
    })
    .select('id')
    .single();

  if (error || !template) throw new Error(`Could not copy the template: ${error?.message}`);
  const newId = template.id as string;

  try {
    const sectionIds = await insertMany(
      'sections',
      source.sections.map((s) => ({ template_id: newId, name: s.name, position: s.position })),
    );

    const itemRows: Record<string, unknown>[] = [];
    source.sections.forEach((section, si) => {
      section.items.forEach((item) => {
        itemRows.push({ section_id: sectionIds[si].id, name: item.name, position: item.position });
      });
    });
    const itemIds = await insertMany('items', itemRows);

    const commentRows: Record<string, unknown>[] = [];
    let cursor = 0;
    source.sections.forEach((section) => {
      section.items.forEach((item) => {
        const itemId = itemIds[cursor].id;
        cursor += 1;
        item.comments.forEach((c) => {
          const { id: _id, item_id: _itemId, ...rest } = c;
          commentRows.push({ ...rest, item_id: itemId });
        });
      });
    });
    if (commentRows.length) await insertMany('comments', commentRows, 'id');

    return newId;
  } catch (err) {
    await supabase.from('templates').delete().eq('id', newId);
    throw err;
  }
}

/** Append a new empty section / item / comment at the end of its parent. */
export async function addSection(templateId: string, name: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('sections')
    .select('position')
    .eq('template_id', templateId)
    .order('position', { ascending: false })
    .limit(1);
  const position = (data?.[0]?.position ?? -1) + 1;
  const { data: row, error } = await supabase
    .from('sections')
    .insert({ template_id: templateId, name, position })
    .select('id')
    .single();
  if (error || !row) throw new Error(error?.message ?? 'Could not add the section.');
  return row.id as string;
}

export async function addItem(sectionId: string, name: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('items')
    .select('position')
    .eq('section_id', sectionId)
    .order('position', { ascending: false })
    .limit(1);
  const position = (data?.[0]?.position ?? -1) + 1;
  const { data: row, error } = await supabase
    .from('items')
    .insert({ section_id: sectionId, name, position })
    .select('id')
    .single();
  if (error || !row) throw new Error(error?.message ?? 'Could not add the item.');
  return row.id as string;
}

export async function addComment(itemId: string, name: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('comments')
    .select('position')
    .eq('item_id', itemId)
    .order('position', { ascending: false })
    .limit(1);
  const position = (data?.[0]?.position ?? -1) + 1;
  const { data: row, error } = await supabase
    .from('comments')
    .insert({ item_id: itemId, name, position, comment_type: 'info' })
    .select('id')
    .single();
  if (error || !row) throw new Error(error?.message ?? 'Could not add the comment.');
  return row.id as string;
}
