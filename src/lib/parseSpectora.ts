import * as XLSX from 'xlsx';
import { sanitizeCommentHtml, htmlToText, hasMarkup } from './sanitize';
import {
  ImportError,
  type CommentType,
  type ImportIssue,
  type ParseResult,
  type ParsedComment,
  type ParsedItem,
  type ParsedPhoto,
  type ParsedSection,
  type Severity,
} from './types';

/**
 * Parser for the Spectora "template export" spreadsheet.
 *
 * The file is one flat sheet where every row is a single comment, and the
 * section and item it belongs to are repeated in the first two columns. The job
 * here is to turn that back into the section -> item -> comment tree, keep the
 * ordering the inspector chose, and be loud about anything we could not carry
 * across instead of quietly dropping it.
 */

/** Header text varies between exports, so match on a squashed form of it. */
function normaliseHeader(header: string): string {
  return String(header ?? '')
    .replace(/\([^)]*\)/g, ' ') // drop the "(info, limit, defect)" hints
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const REQUIRED = ['sectionname', 'itemname', 'commentname'] as const;

const KNOWN_KEYS = new Set([
  'sectionname', 'itemname', 'commentname', 'commenttext', 'commenttype',
  'category', 'multiplechoiceoptions', 'unittypeoptions', 'recommendation',
  'order', 'answertype', 'defaultvalue', 'defaultvalue2', 'defaultunittype',
  'defaultlocation', 'defaultestimatemin', 'defaultestimatemax', 'locked',
  'simpleformat', 'disablephotos', 'uses', 'lastmodified',
]);

const COMMENT_TYPES: Record<string, CommentType> = {
  info: 'info',
  information: 'info',
  limit: 'limitation',
  limitation: 'limitation',
  defect: 'defect',
  deficiency: 'defect',
};

const SEVERITIES: Record<string, Severity> = {
  '-1': 'low',
  '0': 'medium',
  '1': 'high',
  low: 'low',
  medium: 'medium',
  med: 'medium',
  high: 'high',
};

const ANSWER_TYPES = new Set(['boolean', 'checkbox', 'date', 'number', 'range', 'text']);

/** Separator for composite map keys - a character that cannot appear in a name. */
const SEP = String.fromCharCode(1);

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

function splitList(value: string): string[] {
  if (!value) return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function toBool(value: string): boolean {
  const v = value.toLowerCase();
  return v === 'true' || v === 'yes' || v === 'y' || v === '1' || v === 'x';
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseSpectoraWorkbook(
  buffer: ArrayBuffer | Buffer,
  filename: string,
): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    throw new ImportError(
      'That file could not be opened as a spreadsheet. Export the template from Spectora again and upload the .xls/.xlsx file it gives you.',
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ImportError('The spreadsheet has no sheets in it.');

  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  if (rows.length < 2) {
    throw new ImportError('The spreadsheet has a header row but no template rows under it.');
  }

  const issues: ImportIssue[] = [];

  if (workbook.SheetNames.length > 1) {
    issues.push({
      severity: 'warning',
      code: 'extra_sheets_ignored',
      message: `Only the first sheet ("${sheetName}") was imported. ${workbook.SheetNames.length - 1} other sheet(s) in the file were ignored.`,
    });
  }

  // ---- header map ---------------------------------------------------------
  const headerRow = rows[0].map(str);
  const col: Record<string, number> = {};
  const photoCols: { url: number; caption: number; index: number }[] = [];
  const unmapped: string[] = [];

  headerRow.forEach((raw, index) => {
    if (!raw) return;
    const key = normaliseHeader(raw);
    const photo = key.match(/^defaultphoto(\d+)(caption)?$/);
    if (photo) {
      const n = Number(photo[1]);
      let slot = photoCols.find((p) => p.index === n);
      if (!slot) {
        slot = { url: -1, caption: -1, index: n };
        photoCols.push(slot);
      }
      if (photo[2]) slot.caption = index;
      else slot.url = index;
      return;
    }
    if (KNOWN_KEYS.has(key)) {
      if (col[key] === undefined) col[key] = index;
      return;
    }
    unmapped.push(raw);
  });

  const missing = REQUIRED.filter((key) => col[key] === undefined);
  if (missing.length) {
    throw new ImportError(
      `This does not look like a Spectora template export: the columns ${missing
        .map((m) => `"${m}"`)
        .join(', ')} are missing. Expected a sheet starting with Section Name, Item Name, Comment Name.`,
    );
  }

  if (unmapped.length) {
    issues.push({
      severity: 'warning',
      code: 'unknown_columns',
      message: `${unmapped.length} column(s) in the file are not part of the template model and were not imported: ${unmapped.join(', ')}.`,
    });
  }

  const cell = (row: string[], key: string): string =>
    col[key] === undefined ? '' : str(row[col[key]]);

  // ---- rows ---------------------------------------------------------------
  const sections: ParsedSection[] = [];
  const sectionIndex = new Map<string, ParsedSection>();
  const itemIndex = new Map<string, ParsedItem>();
  const seenComments = new Set<string>();

  let rowsImported = 0;
  let rowsSkipped = 0;
  let appearance = 0;
  const appearanceOf = new Map<ParsedComment, number>();
  let photosSeen = 0;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const sheetRow = r + 1; // 1-based, matches the row number shown in Excel

    if (!row || row.every((value) => !str(value))) continue;

    const sectionName = cell(row, 'sectionname');
    const itemName = cell(row, 'itemname');
    const commentName = cell(row, 'commentname');
    const rawText = cell(row, 'commenttext');

    if (!sectionName || !itemName) {
      rowsSkipped += 1;
      issues.push({
        severity: 'skipped',
        code: 'missing_parent',
        message: `Row ${sheetRow} has no ${!sectionName ? 'section' : 'item'} name, so there is nowhere to put it. The row was skipped.`,
        source_row: sheetRow,
        raw_value: commentName || rawText.slice(0, 120),
      });
      continue;
    }

    if (!commentName && !rawText) {
      rowsSkipped += 1;
      issues.push({
        severity: 'skipped',
        code: 'empty_comment',
        message: `Row ${sheetRow} (${sectionName} / ${itemName}) has neither a comment name nor comment text, so it was skipped.`,
        source_row: sheetRow,
      });
      continue;
    }

    // section
    let section = sectionIndex.get(sectionName);
    if (!section) {
      section = { name: sectionName, position: sections.length, items: [] };
      sectionIndex.set(sectionName, section);
      sections.push(section);
    }

    // item
    const itemKey = sectionName + SEP + itemName;
    let item = itemIndex.get(itemKey);
    if (!item) {
      item = { name: itemName, position: section.items.length, comments: [] };
      itemIndex.set(itemKey, item);
      section.items.push(item);
    }

    // comment type
    const rawType = cell(row, 'commenttype').toLowerCase();
    let commentType: CommentType = 'info';
    if (rawType) {
      const mapped = COMMENT_TYPES[rawType];
      if (mapped) {
        commentType = mapped;
      } else {
        issues.push({
          severity: 'warning',
          code: 'unknown_comment_type',
          message: `Row ${sheetRow}: comment type "${rawType}" is not one of info / limit / defect. It was imported as "info".`,
          source_row: sheetRow,
          column_name: 'Comment Type',
          raw_value: rawType,
        });
      }
    }

    // severity
    const rawCategory = cell(row, 'category').toLowerCase();
    let severity: Severity | null = null;
    if (rawCategory) {
      severity = SEVERITIES[rawCategory] ?? null;
      if (!severity) {
        issues.push({
          severity: 'warning',
          code: 'unknown_category',
          message: `Row ${sheetRow}: severity "${rawCategory}" was not recognised, so the comment has no severity set.`,
          source_row: sheetRow,
          column_name: 'Category',
          raw_value: rawCategory,
        });
      }
    }

    // answer type
    const rawAnswer = cell(row, 'answertype').toLowerCase();
    const answerType: string | null = rawAnswer || null;
    if (rawAnswer && !ANSWER_TYPES.has(rawAnswer)) {
      issues.push({
        severity: 'warning',
        code: 'unknown_answer_type',
        message: `Row ${sheetRow}: answer type "${rawAnswer}" is not one this app knows about. It was kept as-is but may not render correctly.`,
        source_row: sheetRow,
        column_name: 'Answer Type',
        raw_value: rawAnswer,
      });
    }

    // rich text
    const bodyHtml = sanitizeCommentHtml(rawText);
    const bodyText = htmlToText(rawText);
    if (hasMarkup(rawText) && htmlToText(bodyHtml) !== bodyText) {
      issues.push({
        severity: 'warning',
        code: 'markup_simplified',
        message: `Row ${sheetRow} ("${commentName}"): some formatting in the comment text was not supported and was simplified.`,
        source_row: sheetRow,
        column_name: 'Comment Text',
      });
    }

    // photos
    const photos: ParsedPhoto[] = [];
    for (const slot of photoCols) {
      const url = slot.url >= 0 ? str(row[slot.url]) : '';
      const caption = slot.caption >= 0 ? str(row[slot.caption]) : '';
      if (url) photos.push({ url, caption });
    }
    photosSeen += photos.length;

    const estimateMinRaw = cell(row, 'defaultestimatemin');
    const estimateMaxRaw = cell(row, 'defaultestimatemax');
    const estimateMin = toNumber(estimateMinRaw);
    const estimateMax = toNumber(estimateMaxRaw);
    if (estimateMinRaw && estimateMin === null) {
      issues.push({
        severity: 'warning',
        code: 'bad_number',
        message: `Row ${sheetRow}: estimate minimum "${estimateMinRaw}" is not a number and was left blank.`,
        source_row: sheetRow,
        column_name: 'Default Estimate Min',
        raw_value: estimateMinRaw,
      });
    }
    if (estimateMaxRaw && estimateMax === null) {
      issues.push({
        severity: 'warning',
        code: 'bad_number',
        message: `Row ${sheetRow}: estimate maximum "${estimateMaxRaw}" is not a number and was left blank.`,
        source_row: sheetRow,
        column_name: 'Default Estimate Max',
        raw_value: estimateMaxRaw,
      });
    }

    const name = commentName || '(untitled comment)';
    const dupKey = itemKey + SEP + name.toLowerCase();
    if (seenComments.has(dupKey)) {
      issues.push({
        severity: 'warning',
        code: 'duplicate_comment',
        message: `Row ${sheetRow}: "${name}" appears more than once under ${sectionName} / ${itemName}. Both copies were imported.`,
        source_row: sheetRow,
      });
    }
    seenComments.add(dupKey);

    const order = toNumber(cell(row, 'order'));

    const comment: ParsedComment = {
      name,
      body_html: bodyHtml,
      body_text: bodyText,
      comment_type: commentType,
      severity,
      recommendation: cell(row, 'recommendation') || null,
      answer_type: answerType,
      choices: splitList(cell(row, 'multiplechoiceoptions')),
      unit_types: splitList(cell(row, 'unittypeoptions')),
      default_value: cell(row, 'defaultvalue') || null,
      default_value_2: cell(row, 'defaultvalue2') || null,
      default_unit_type: cell(row, 'defaultunittype') || null,
      default_location: cell(row, 'defaultlocation') || null,
      estimate_min: estimateMin,
      estimate_max: estimateMax,
      locked: toBool(cell(row, 'locked')),
      simple_format: toBool(cell(row, 'simpleformat')),
      disable_photos: toBool(cell(row, 'disablephotos')),
      uses: toNumber(cell(row, 'uses')) ?? 0,
      photos,
      position: order ?? Number.MAX_SAFE_INTEGER,
      source_row: sheetRow,
    };

    appearanceOf.set(comment, appearance);
    appearance += 1;
    item.comments.push(comment);
    rowsImported += 1;
  }

  if (!rowsImported) {
    throw new ImportError(
      'No template rows could be read from the file. Every row was missing a section or item name.',
    );
  }

  // Sort comments by the order column, falling back to the order they appeared
  // in the file so the result is stable and never arbitrary.
  for (const section of sections) {
    for (const item of section.items) {
      item.comments.sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return (appearanceOf.get(a) ?? 0) - (appearanceOf.get(b) ?? 0);
      });
      item.comments.forEach((c, i) => {
        c.position = i;
      });
    }
  }

  if (photosSeen) {
    issues.push({
      severity: 'warning',
      code: 'photos_linked_not_copied',
      message: `${photosSeen} default photo link(s) were recorded, but the images themselves were not copied into this app. If those URLs stop working, the images will stop loading.`,
    });
  }

  const itemsCount = sections.reduce((n, s) => n + s.items.length, 0);
  const commentsCount = sections.reduce(
    (n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0),
    0,
  );

  return {
    templateName: templateNameFromFilename(filename),
    sections,
    issues,
    stats: {
      rowsTotal: rows.length - 1,
      rowsImported,
      rowsSkipped,
      sections: sections.length,
      items: itemsCount,
      comments: commentsCount,
    },
  };
}

export function templateNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim();
  const cleaned = base
    .replace(/[-_\s]*\d{4}[-_]\d{2}[-_]\d{2}[-_\s]*$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'Imported template';
}
