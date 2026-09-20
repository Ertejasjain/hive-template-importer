/**
 * Sanity check for the parser, run against the real Spectora export without
 * needing a database:  npm run parse:check
 *
 * It prints the tree it reconstructed and every issue it recorded, so a
 * mis-mapped column shows up immediately instead of after an import.
 */
import { readFileSync } from 'node:fs';
import { parseSpectoraWorkbook } from '../src/lib/parseSpectora';

const path = process.argv[2] ?? 'sample/InterNACHI-Residential-2026-09-20.xls';
const buf = readFileSync(path);
const result = parseSpectoraWorkbook(buf, path.split('/').pop() ?? path);

console.log('Template:', result.templateName);
console.table(result.stats);

const byCode: Record<string, number> = {};
for (const issue of result.issues) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
console.log('Issues by code:', byCode);

for (const section of result.sections) {
  const comments = section.items.reduce((n, i) => n + i.comments.length, 0);
  console.log(
    `${String(section.position).padStart(2)}. ${section.name} - ${section.items.length} items, ${comments} comments`,
  );
}

const all = result.sections.flatMap((s) => s.items).flatMap((i) => i.comments);
const withHtml = all.filter((c) => c.body_html.includes('<'));
const defects = all.filter((c) => c.comment_type === 'defect');
const withChoices = all.filter((c) => c.choices.length > 0);

console.log(`\nComments with markup preserved: ${withHtml.length}`);
console.log(`Defects: ${defects.length}  High severity: ${all.filter((c) => c.severity === 'high').length}`);
console.log(`Comments with choice lists: ${withChoices.length}`);
console.log('\nExample html:', withHtml[0]?.body_html.slice(0, 180));
console.log('Example text:', JSON.stringify(withHtml[0]?.body_text.slice(0, 180)));
console.log('\nFirst comment:', JSON.stringify(result.sections[0].items[0].comments[0], null, 2));
