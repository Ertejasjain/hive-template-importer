# Template Importer

Home inspectors keep their whole inspection template in software like Spectora: the sections they
walk, the items inside each section, and the library of comments they drop into reports. Moving to a
new platform means moving that template, and inspectors will not retype four hundred comments.

This app takes the spreadsheet Spectora exports, turns it back into a real template — sections,
items and comments, in the inspector's own order — stores it, and lets you edit it in the browser.

- Upload a Spectora template export (`.xls` / `.xlsx` / `.csv`)
- See the template as a tree, with rich comment text preserved
- Edit any name or comment body inline; add and delete sections, items and comments
- Duplicate a template into an independent copy
- **Import report**: every upload shows how many rows went in, and names every row that was skipped
  or changed, with its spreadsheet row number

Built with Next.js (App Router) + TypeScript, Supabase (Postgres) and SheetJS, deployed on Vercel.

**Live: https://hive-template-importer-swart.vercel.app**

---

## Run it locally

You need Node 18 or newer and a free Supabase project.

### 1. Install

```bash
git clone <this repo>
cd hive-template-importer
npm install
```

### 2. Create the database

1. Go to [supabase.com](https://supabase.com) → **New project**. Any region, free tier is fine.
2. Open **SQL Editor → New query**.
3. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.

That creates the tables (`templates`, `sections`, `items`, `comments`, `import_runs`,
`import_issues`), their indexes, `updated_at` triggers, and row-level-security policies. It is safe
to run more than once.

### 3. Point the app at it

```bash
cp .env.example .env.local
```

Fill in the values from **Project Settings → API**:

| Variable | Where it comes from | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key | optional, see below |

The app reads and writes entirely on the server. If `SUPABASE_SERVICE_ROLE_KEY` is set it is used
and never reaches the browser; otherwise the anon key is used, which works because the schema ships
with permissive anon policies.

`.env.local` is gitignored. **No keys are committed to this repository**, and none should be.

### 4. Start it

```bash
npm run dev
```

Open <http://localhost:3000> and upload `sample/InterNACHI-Residential-2026-09-20.xls` — the real
export this was built against.

---

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo, leave the framework detection alone.
3. Add the same three environment variables under **Settings → Environment Variables**.
4. Deploy.

Nothing else is needed: the app has no build-time database access and no background jobs.

---

## Checking the parser without a database

The parser is pure and has no Supabase dependency, so it can be run on its own:

```bash
npm run parse:check
```

It prints the reconstructed tree, the counts, and every issue the importer would record. Against the
sample file it reports 392 rows, 13 sections, 69 items and 392 comments, with 198 comments whose
rich-text formatting was preserved.

To check a different file:

```bash
npm run parse:check -- path/to/other-export.xls
```

And to see what the importer does with bad input — a text file, a sheet with the wrong headers, rows
missing their section, unknown values — run:

```bash
npm run errors:check
```

---

## What the importer expects

One sheet, one row per comment, with the section and item repeated on every row. The columns it
reads (matched loosely, so the bracketed hints in the header do not matter):

| Column | Goes to |
| --- | --- |
| Section Name, Item Name, Comment Name | the section → item → comment tree |
| Comment Text | comment body, sanitised, HTML preserved |
| Comment Type | `info` / `limit` → limitation / `defect` |
| Category | severity: `-1` low, `0` medium, `1` high |
| Order (w/i item) | comment order inside its item |
| Answer Type, Multiple Choice Options, Unit Type Options | how the comment is answered in the field |
| Default Value / Value 2 / Unit Type / Location | pre-filled answers |
| Default Estimate Min / Max | repair estimate range |
| Recommendation, Locked, Simple Format, Disable Photos, Uses | kept as-is |
| Default Photo 1–10 + captions | stored as links (see NOTES.md) |

Anything else in the file is reported in the import report rather than silently ignored.

---

## Project layout

```
src/lib/parseSpectora.ts   the parser: spreadsheet -> section/item/comment tree + issue list
src/lib/sanitize.ts        HTML allow-list for comment bodies
src/lib/db.ts              all Supabase reads and writes
src/app/actions.ts         server actions the UI calls
src/app/page.tsx           upload + template list
src/app/templates/[id]/    template view and editor
src/components/            upload form, editor, rich-text box, import report
supabase/schema.sql        the database
scripts/check-parser.ts    parser smoke test
sample/                    the real Spectora export used throughout
```

See [NOTES.md](NOTES.md) for the decisions behind this, what is deliberately not built, and how it
was tested.
