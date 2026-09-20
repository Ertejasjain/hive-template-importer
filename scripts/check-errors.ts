/**
 * Exercises the importer's failure paths on synthetic files, so a bad upload is
 * known to produce a specific, readable message instead of a stack trace:
 *   npm run errors:check
 */
import * as XLSX from 'xlsx';
import { parseSpectoraWorkbook } from '../src/lib/parseSpectora';

function sheet(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function check(label: string, make: () => Buffer, name = 'x.xlsx') {
  try {
    const result = parseSpectoraWorkbook(make(), name);
    console.log(`[imported] ${label}`);
    console.log(`           ${JSON.stringify(result.stats)}`);
    for (const issue of result.issues) {
      console.log(`           - ${issue.severity}/${issue.code}: ${issue.message}`);
    }
  } catch (err) {
    console.log(`[rejected] ${label}`);
    console.log(`           ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log();
}

const HEADERS = [
  'Section Name', 'Item Name', 'Comment Name', 'Comment Text',
  'Comment Type (info, limit, defect)', 'Category (-1: Low, 0: Med, 1: High)',
  'Order (w/i item)', 'Answer Type', 'Default Estimate Min', 'Mystery Column',
];

check('a text file that is not a spreadsheet', () => Buffer.from('just some notes'), 'notes.txt');
check('the right headers but no rows', () => sheet([HEADERS.slice(0, 3)]));
check('a spreadsheet with unrelated headers', () => sheet([['Foo', 'Bar'], ['a', 'b']]));
check('every row missing its section', () =>
  sheet([HEADERS.slice(0, 3), ['', 'Item', 'Comment']]));

check('a file with a bit of everything wrong', () =>
  sheet([
    HEADERS,
    ['Roof', 'Shingles', 'Missing shingles', '<p>Bad <script>alert(1)</script>shingle</p>', 'defect', '1', '1', 'boolean', '', 'zzz'],
    ['Roof', 'Shingles', 'Earlier comment', '<p>fine</p>', 'info', '0', '0', 'boolean', '', ''],
    ['Roof', 'Shingles', 'Earlier comment', '<p>duplicate name</p>', 'weird', '9', '2', 'quantum', 'not a number', ''],
    ['', 'Orphan', 'No section', 'x', 'info', '0', '0', 'boolean', '', ''],
    ['Roof', 'Shingles', '', '', 'info', '0', '0', 'boolean', '', ''],
  ]),
  'Mixed Export 2026-09-20.xlsx',
);
