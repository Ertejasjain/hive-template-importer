'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseSpectoraWorkbook } from '@/lib/parseSpectora';
import { sanitizeCommentHtml, htmlToText } from '@/lib/sanitize';
import { ImportError } from '@/lib/types';
import {
  addComment,
  addItem,
  addSection,
  deleteRow,
  duplicateTemplate,
  importTemplate,
  updateRow,
} from '@/lib/db';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['.xls', '.xlsx', '.xlsm', '.csv'];

export type UploadState = { error: string | null };

export async function uploadTemplate(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a template export file first.' };
  }
  if (file.size > MAX_BYTES) {
    return {
      error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB - a template export is normally well under 1 MB.`,
    };
  }
  const lower = file.name.toLowerCase();
  if (!ACCEPTED.some((ext) => lower.endsWith(ext))) {
    return { error: `"${file.name}" is not a spreadsheet. Upload the .xls or .xlsx file Spectora exports.` };
  }

  let templateId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSpectoraWorkbook(buffer, file.name);
    const result = await importTemplate(parsed, file.name, file.size);
    templateId = result.templateId;
  } catch (err) {
    if (err instanceof ImportError) return { error: err.message };
    const message = err instanceof Error ? err.message : String(err);
    return { error: `The import failed and nothing was saved. ${message}` };
  }

  revalidatePath('/');
  redirect(`/templates/${templateId}?imported=1`);
}

/* ------------------------------------------------------------------ edits */

function requireText(value: FormDataEntryValue | null, label: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} cannot be empty.`);
  return text;
}

export async function renameTemplate(id: string, name: string) {
  await updateRow('templates', id, { name: requireText(name, 'The template name') });
  revalidatePath(`/templates/${id}`);
  revalidatePath('/');
}

export async function renameSection(templateId: string, id: string, name: string) {
  await updateRow('sections', id, { name: requireText(name, 'The section name') });
  revalidatePath(`/templates/${templateId}`);
}

export async function renameItem(templateId: string, id: string, name: string) {
  await updateRow('items', id, { name: requireText(name, 'The item name') });
  revalidatePath(`/templates/${templateId}`);
}

export interface CommentPatch {
  name?: string;
  body_html?: string;
  comment_type?: 'info' | 'limitation' | 'defect';
  severity?: 'low' | 'medium' | 'high' | null;
  recommendation?: string | null;
}

export async function saveComment(
  templateId: string,
  id: string,
  patch: CommentPatch,
): Promise<string | undefined> {
  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) update.name = requireText(patch.name, 'The comment name');
  if (patch.body_html !== undefined) {
    // Sanitise again on the server: the editor runs in the browser, so what
    // arrives here is untrusted no matter how it was produced.
    const html = sanitizeCommentHtml(patch.body_html);
    update.body_html = html;
    update.body_text = htmlToText(html);
  }
  if (patch.comment_type !== undefined) update.comment_type = patch.comment_type;
  if (patch.severity !== undefined) update.severity = patch.severity;
  if (patch.recommendation !== undefined) {
    update.recommendation = patch.recommendation?.trim() || null;
  }

  if (Object.keys(update).length === 0) return undefined;

  await updateRow('comments', id, update);
  revalidatePath(`/templates/${templateId}`);
  return update.body_html as string | undefined;
}

export async function removeSection(templateId: string, id: string) {
  await deleteRow('sections', id);
  revalidatePath(`/templates/${templateId}`);
}

export async function removeItem(templateId: string, id: string) {
  await deleteRow('items', id);
  revalidatePath(`/templates/${templateId}`);
}

export async function removeComment(templateId: string, id: string) {
  await deleteRow('comments', id);
  revalidatePath(`/templates/${templateId}`);
}

export async function createSection(templateId: string) {
  const id = await addSection(templateId, 'New section');
  revalidatePath(`/templates/${templateId}`);
  return id;
}

export async function createItem(templateId: string, sectionId: string) {
  const id = await addItem(sectionId, 'New item');
  revalidatePath(`/templates/${templateId}`);
  return id;
}

export async function createComment(templateId: string, itemId: string) {
  const id = await addComment(itemId, 'New comment');
  revalidatePath(`/templates/${templateId}`);
  return id;
}

/* -------------------------------------------------------- copy and delete */

export async function copyTemplate(id: string) {
  const newId = await duplicateTemplate(id);
  revalidatePath('/');
  redirect(`/templates/${newId}`);
}

export async function deleteTemplate(id: string) {
  await deleteRow('templates', id);
  revalidatePath('/');
  redirect('/');
}
