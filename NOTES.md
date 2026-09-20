# Notes

## The thing I kept coming back to

The user here is an inspector who already has a template they trust, built up over years. The risk
in a migration tool is not that it fails loudly — it is that it succeeds quietly and drops eleven
comments, and nobody notices until one of them was needed in a report.

So the extra thing I built is the **import report**. Every upload records how many rows were in the
file, how many became comments, and a row-by-row list of anything that was skipped or altered, with
the spreadsheet row number so it can be checked against the original in Excel. The first thing you
see after an import is either "all 392 rows were imported, nothing was dropped" or exactly what went
wrong and where.

That is also why the parser never throws away a row silently. Every branch that discards or changes
something writes an issue with a code, a human-readable message and the source row.

## Decisions

**Sections → items → comments, with explicit `position` columns.** The export is one flat sheet
with the section and item repeated on every row, and the order of that sheet is meaningful — an
inspector walks a house in an order. Nothing in the app relies on insertion order or sorts
alphabetically. Comments are ordered by the export's `Order (w/i item)` column, falling back to the
order they appeared in the file so the result is stable rather than arbitrary.

**Comment text is HTML, and it stays HTML.** 198 of the 392 comments in the sample carry markup —
paragraphs, bold, lists. Flattening that to plain text would change what the inspector wrote, so
comment bodies are sanitised against an allow-list and stored as HTML, with a plain-text copy
alongside for searching. The editor is a small rich-text box rather than a raw HTML textarea,
because an inspector should not have to see a `<p>` tag. Whatever the browser produces is sanitised
again on the server, since anything arriving from a client is untrusted.

**Column matching is loose.** Headers are squashed (bracketed hints dropped, punctuation and case
removed) before matching, so `Comment Type (info, limit, defect)` and `comment type` both work. Only
Section Name, Item Name and Comment Name are required; everything else is optional, and unknown
columns are reported rather than ignored.

**Imports are all-or-nothing.** Writing a template is several inserts, and Postgres cannot do them
in one statement from the JS client. If any of them fails, the template row is deleted — which
cascades — so a half-imported template never exists. The failure is still written to `import_runs`,
so the user sees what happened instead of an empty screen.

**The password gate is a signed cookie, not the password.** The session cookie is
`<expiry>.<HMAC>`, httpOnly and signed with a server-side secret, so it cannot be forged or
extended; nothing derived from the password reaches the browser. The check runs in middleware rather
than in each page, so a route added later is protected by default instead of by remembering to
protect it. Set no `APP_PASSWORD` and the app is simply open, which is what you want when running it
locally.

**Duplicating a template makes a real copy.** Every section, item and comment is re-inserted with
new ids. Editing a copy can never touch the original, which is the point: inspectors want to branch
a template for a different inspection type, not share one.

## What is supported

- `.xls`, `.xlsx`, `.xlsm` and `.csv` exports, up to 8 MB (the sample export is 55 KB)
- The 42 columns Spectora exports, listed in the README
- Templates of any size; writes are batched at 250 rows per request

## What I deliberately did not build

- **Per-user accounts and permissions.** There is one shared password in front of the app, which
  stops the deployed URL being open to anyone who finds it, but everyone who gets in sees the same
  templates. There are no users, no roles and no audit trail of who changed what. The schema has RLS
  switched on with explicit permissive policies rather than switched off, so adding real auth is a
  matter of tightening those policies to an `owner_id` — not retro-fitting the security model.
- **Drag-and-drop reordering.** The `position` columns are there and are respected everywhere, so
  the data model supports it; the UI does not yet. Import fidelity mattered more than rearranging.
- **Photo hosting.** The photo columns are read and the URLs stored, but the images are not copied
  into Supabase storage. If those URLs stop resolving the images stop loading, so the import report
  says so explicitly. The sample export has no photos in it.
- **Export back out to Spectora format.** Out of scope for this brief.
- **Undo.** Deletes are confirmed but permanent.
- **Multi-file / merge imports.** Each upload creates its own template.

## How I checked it

- `npm run parse:check` runs the parser over the real export with no database and prints the tree it
  rebuilt. Against `sample/InterNACHI-Residential-2026-09-20.xls` it reports **392 rows in, 392
  imported, 0 skipped, 13 sections, 69 items, 392 comments**, which matches what the spreadsheet
  contains when counted independently.
- I cross-checked the category and type mappings against the raw column values: 302 defects, 78
  info, 12 limitations; 21 high-severity, 281 medium; 72 comments with choice lists.
- Rich text: 198 comments come through with their markup intact, and the plain-text copy of each one
  matches the text content of the HTML.
- `npm run errors:check` runs the importer over deliberately broken files — a text file, a sheet
  with unrelated headers, a header row with nothing under it, rows missing their section, unknown
  comment types and answer types, a non-numeric estimate, a duplicate comment name. Each either
  produces a specific message rather than a stack trace, or imports with the problem listed.
- End to end against a live Supabase project: the sample file imports to 13/69/392 rows with a clean
  report, editing a comment's rich text persists as HTML with the plain-text copy regenerated,
  duplicating produces an independent 13/69/392 copy, and deleting a template removes its sections,
  items and comments with it.
- The password gate: a signed-out request to any page redirects to `/login` and remembers where it
  was going, a wrong password is rejected, the right one lands on the page originally asked for, and
  a malformed template id returns 404 rather than a Postgres error.

## Time spent

Roughly four hours end to end: about an hour reverse-engineering the export format and settling the
schema, two building the importer and the editor, and the rest on the import report, error handling
and this write-up.

## Credits

Built by Tejas Jain. I used Claude (via Claude Code) as a pair-programming assistant throughout —
for scaffolding, for drafting the parser and UI components, and for review. The export was analysed
directly and every mapping in the parser was verified against the real file rather than assumed; the
data-model and scope decisions above are mine. SheetJS handles spreadsheet reading and
`sanitize-html` handles the HTML allow-list.
