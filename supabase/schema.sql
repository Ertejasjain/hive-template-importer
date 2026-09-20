-- Hive template importer - database schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query -> Run).
-- It is safe to re-run: every object is created only if it is missing.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- templates
-- ---------------------------------------------------------------------------
create table if not exists templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  source_file    text,                    -- original filename of the import
  source_format  text default 'spectora', -- which importer produced this template
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sections -> items -> comments
-- `position` is the display order and is what preserves the order of the
-- original spreadsheet. Nothing relies on insertion order or on alphabetical
-- sorting, because the inspector's ordering is meaningful.
-- ---------------------------------------------------------------------------
create table if not exists sections (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references templates(id) on delete cascade,
  name         text not null,
  position     integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sections_template_idx on sections(template_id, position);

create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references sections(id) on delete cascade,
  name        text not null,
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists items_section_idx on items(section_id, position);

create table if not exists comments (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references items(id) on delete cascade,
  name               text not null,
  -- Sanitised rich text exactly as it should render in the report.
  body_html          text not null default '',
  -- Plain-text version of the same content, for search and for plain exports.
  body_text          text not null default '',
  comment_type       text not null default 'info',   -- info | limitation | defect
  severity           text,                            -- low | medium | high (defects only)
  recommendation     text,
  answer_type        text,                            -- boolean | checkbox | date | number | range | text
  choices            text[] not null default '{}',    -- options for checkbox / multiple choice
  unit_types         text[] not null default '{}',    -- options for number / range answers
  default_value      text,
  default_value_2    text,                            -- upper bound for "range" answers
  default_unit_type  text,
  default_location   text,
  estimate_min       numeric,
  estimate_max       numeric,
  locked             boolean not null default false,
  simple_format      boolean not null default false,
  disable_photos     boolean not null default false,
  uses               integer not null default 0,
  photos             jsonb not null default '[]'::jsonb, -- [{ url, caption }]
  position           integer not null,
  source_row         integer,                          -- spreadsheet row this came from
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists comments_item_idx on comments(item_id, position);

-- ---------------------------------------------------------------------------
-- Import bookkeeping.
-- Every upload writes one import_runs row, plus one import_issues row for
-- anything that was changed, skipped or could not be represented. The point is
-- that an inspector can see exactly what happened to their file instead of
-- having to diff 400 rows by hand.
-- ---------------------------------------------------------------------------
create table if not exists import_runs (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid references templates(id) on delete cascade,
  filename       text not null,
  file_size      integer,
  status         text not null default 'success',  -- success | partial | failed
  rows_total     integer not null default 0,
  rows_imported  integer not null default 0,
  rows_skipped   integer not null default 0,
  sections_count integer not null default 0,
  items_count    integer not null default 0,
  comments_count integer not null default 0,
  error_message  text,
  created_at     timestamptz not null default now()
);
create index if not exists import_runs_template_idx on import_runs(template_id);

create table if not exists import_issues (
  id             uuid primary key default gen_random_uuid(),
  import_run_id  uuid not null references import_runs(id) on delete cascade,
  severity       text not null default 'warning',  -- warning | skipped
  code           text not null,                    -- machine-readable reason
  message        text not null,                    -- human-readable explanation
  source_row     integer,
  column_name    text,
  raw_value      text,
  created_at     timestamptz not null default now()
);
create index if not exists import_issues_run_idx on import_issues(import_run_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['templates','sections','items','comments'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security.
-- This build has no user accounts (see NOTES.md), so the anon key is allowed to
-- read and write. RLS is switched on with explicit policies rather than left
-- off, so that adding auth later is a matter of tightening these policies
-- instead of retro-fitting the whole security model.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['templates','sections','items','comments','import_runs','import_issues'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_anon_all on %I', t, t);
    execute format(
      'create policy %I_anon_all on %I for all to anon, authenticated using (true) with check (true)',
      t, t);
  end loop;
end $$;
