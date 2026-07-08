-- =====================================================================
-- WEBSITE REVIEW TOOL — Supabase schema (run once in the SQL Editor)
-- =====================================================================
-- Capability-URL model, reused from the HomeApp (sc-rentals) pattern:
-- access is scoped by the x-board-key request header via RLS. The
-- publishable key is PUBLIC by design — RLS + the secret project key are
-- the whole security boundary. NEVER put a secret key in the browser/config.
--
-- Provisioning a project (creating a projects row) is a PRIVILEGED action
-- done here in the SQL Editor (service role) — anon cannot self-provision.
-- Everything else (notes/comments/attachments/photos) is anon, scoped by
-- the project key the client presents as the x-board-key header.
--
-- Decisions baked in (see PLAN.md): D1 anchoring by section_id + verbatim
-- quote + fractional bbox; D3 status = open|resolved|wont_fix + resolution;
-- D4 photos = one PUBLIC-READ bucket, writes scoped to projects/<key>/...;
-- D7 every insert carries project_key + FK to projects.
-- =====================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- helper: the project key the caller presents as a header (as HomeApp).
-- ---------------------------------------------------------------------
create or replace function public.board_key() returns text
language sql stable as $$
  select current_setting('request.headers', true)::json ->> 'x-board-key'
$$;

-- =====================================================================
-- 1. PROJECTS  (one row per client site / review board)
--    project_key is the secret capability slug == the x-board-key header.
--    Created here with the service role; anon may read/update its OWN row
--    only, and may NOT insert (no self-provisioning) or enumerate others.
-- =====================================================================
create table if not exists public.projects (
  project_key  text primary key,               -- UUID slug; == x-board-key
  name         text not null default 'Untitled review',
  site_host    text,                            -- e.g. 'ruthpedida.co.il' (informational)
  archived     boolean not null default false,
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- 2. NOTES  (all four annotation kinds live here, discriminated by kind)
--    Anchoring (D1): section_id (nearest ancestor id) + target_text
--    (verbatim quote) + geometry (fractional coords). elem_desc is a
--    plain-English description so Claude can sanity-check the target.
-- =====================================================================
create table if not exists public.notes (
  id              uuid primary key default gen_random_uuid(),
  project_key     text not null references public.projects(project_key) on delete cascade,

  kind            text not null check (kind in ('pin','box','text','draw')),

  -- WHERE on the site
  page_url        text not null default '/',    -- location.pathname (+hash) of host page
  page_title      text,
  section_id      text,                          -- nearest ancestor id: 'about','process',...
  target_selector text,                          -- short CSS path (secondary locator)
  target_text     text,                          -- verbatim quoted text (load-bearing for kind='text')
  elem_desc       text,                          -- "the green CTA button in #contact"

  -- geometry: fractional (0..1) coords relative to the anchor, so they
  -- survive responsive reflow. Interpretation depends on kind:
  --   pin  : {"x":0.42,"y":0.30}
  --   box  : {"x":0.10,"y":0.20,"w":0.30,"h":0.15}
  --   text : {"quote":"...","prefix":"...","suffix":"..."}  (words, not coords)
  --   draw : {"paths":[[[x,y],...]],"stroke":"#e11","width":3}
  geometry        jsonb not null default '{}'::jsonb,
  viewport_w      int,
  viewport_h      int,
  device_px_ratio real,

  -- CONTENT
  body            text not null default '',      -- the reviewer's note
  status          text not null default 'open'   -- D3: 3-state, authoritative
                    check (status in ('open','resolved','wont_fix')),
  resolution      text,                           -- non-null => Claude proposed, awaiting owner
  priority        text default 'normal' check (priority in ('low','normal','high')),
  color           text,                           -- marker color chosen by reviewer

  -- WHO / WHEN
  author          text,                           -- free-text name (no login)
  author_id       text,                           -- random per-browser id, for "my notes"
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text,
  resolved_at     timestamptz
);

create index if not exists notes_project_idx      on public.notes (project_key);
create index if not exists notes_proj_status_idx   on public.notes (project_key, status);
create index if not exists notes_proj_updated_idx  on public.notes (project_key, updated_at desc);

-- Realtime UPDATE/DELETE payloads carry full rows (so merge logic sees old+new).
alter table public.notes replica identity full;

-- keep updated_at honest on every UPDATE
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 3. COMMENTS  (threaded replies under a note; append-only, like HomeApp)
-- =====================================================================
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes(id) on delete cascade,
  project_key  text not null references public.projects(project_key) on delete cascade,
  author       text,
  author_id    text,
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists comments_note_idx    on public.comments (note_id, created_at);
create index if not exists comments_project_idx on public.comments (project_key);

-- =====================================================================
-- 4. ATTACHMENTS  (photo metadata; bytes live in Storage — see part 6)
--    storage_path convention (D4): projects/<project_key>/<note_id>/<uuid>.<ext>
-- =====================================================================
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes(id) on delete cascade,
  project_key  text not null references public.projects(project_key) on delete cascade,
  storage_path text not null,
  mime         text,
  width        int,
  height       int,
  bytes        int,
  author       text,
  created_at   timestamptz not null default now()
);

create index if not exists attachments_note_idx    on public.attachments (note_id);
create index if not exists attachments_project_idx on public.attachments (project_key);

-- =====================================================================
-- 5. ROW-LEVEL SECURITY  (the whole security boundary — must ship first)
--    Same expression as HomeApp: board = the x-board-key header.
-- =====================================================================
alter table public.projects    enable row level security;
alter table public.notes       enable row level security;
alter table public.comments    enable row level security;
alter table public.attachments enable row level security;

-- PROJECTS: read + update your OWN row only. No insert (no self-provisioning),
-- no reading/enumerating other projects.
drop policy if exists projects_self_read   on public.projects;
drop policy if exists projects_self_update on public.projects;
create policy projects_self_read on public.projects
  for select using ( project_key = public.board_key() );
create policy projects_self_update on public.projects
  for update using      ( project_key = public.board_key() )
             with check ( project_key = public.board_key() );

-- NOTES / COMMENTS / ATTACHMENTS: full access scoped to the caller's board.
drop policy if exists notes_board_access       on public.notes;
drop policy if exists comments_board_access     on public.comments;
drop policy if exists attachments_board_access  on public.attachments;
create policy notes_board_access on public.notes
  for all using ( project_key = public.board_key() )
          with check ( project_key = public.board_key() );
create policy comments_board_access on public.comments
  for all using ( project_key = public.board_key() )
          with check ( project_key = public.board_key() );
create policy attachments_board_access on public.attachments
  for all using ( project_key = public.board_key() )
          with check ( project_key = public.board_key() );

-- =====================================================================
-- 6. STORAGE  (photos)  — D4: one PUBLIC-READ bucket; writes folder-scoped.
--    Path: projects/<project_key>/<note_id>/<uuid>.<ext>
--    storage.foldername(name) -> path segments:
--      [1]='projects', [2]=<project_key>, [3]=<note_id>
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

-- WRITE: only into your own project's folder, and only if that project exists.
drop policy if exists "review write own project folder"  on storage.objects;
drop policy if exists "review update own project folder" on storage.objects;
drop policy if exists "review delete own project folder" on storage.objects;

create policy "review write own project folder"
on storage.objects for insert to anon
with check (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[2] = public.board_key()
  and exists (select 1 from public.projects p where p.project_key = public.board_key())
);

create policy "review update own project folder"
on storage.objects for update to anon
using (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[2] = public.board_key()
);

create policy "review delete own project folder"
on storage.objects for delete to anon
using (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[2] = public.board_key()
);
-- READ needs no policy: the bucket is public (D4). Paths are unguessable UUIDs.

-- =====================================================================
-- 7. GRANTS  (RLS still governs WHICH rows; grants open the verbs)
-- =====================================================================
grant usage on schema public to anon;
grant select, update                       on public.projects    to anon;  -- no insert/delete
grant select, insert, update, delete       on public.notes       to anon;
grant select, insert, delete               on public.comments    to anon;
grant select, insert, delete               on public.attachments to anon;
grant execute on function public.board_key() to anon;

-- =====================================================================
-- 8. REALTIME  (one channel per board subscribes to these three tables)
-- =====================================================================
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.attachments;

-- =====================================================================
-- 9. PROVISION A PROJECT  (run per client, service role. Copy the key.)
--    Re-run "select project_key,name from public.projects;" any time to
--    recover a key you lost.
-- =====================================================================
insert into public.projects (project_key, name, site_host)
values (gen_random_uuid()::text, 'Ruth — coaching site', 'ruthpedida.co.il')
returning project_key;   -- <- paste this into the reviewer link / embed snippet
