-- =====================================================================
-- Website Review — BUILD 2: Review OS core (clients + deliverables)
-- Run once in the SQL Editor. Safe to re-run.
-- ---------------------------------------------------------------------
-- A CLIENT groups deliverables. A DELIVERABLE is anything under review —
-- a website page, image, PDF, deck — each with its own review board
-- (project_key) and, for non-website assets, a hosted proof page that
-- renders the asset with the review widget on top.
-- Access model: same capability-header pattern — rows are scoped to
-- x-board-key = client_key (the client portal's key) or the asset's board.
-- =====================================================================

create table if not exists public.clients (
  client_key text primary key,          -- short slug: 'lovedust', 'ruth'
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.deliverables (
  id         uuid primary key default gen_random_uuid(),
  client_key text not null references public.clients(client_key) on delete cascade,
  kind       text not null default 'other'
               check (kind in ('website','image','pdf','deck','doc','other')),
  title      text not null,
  board      text not null,             -- the review board (project_key) for this asset
  src        text,                      -- what the proof page renders (public URL), or the live site URL
  status     text not null default 'under_review'
               check (status in ('under_review','approved','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deliverables_client_idx on public.deliverables (client_key);

drop trigger if exists deliverables_touch on public.deliverables;
create trigger deliverables_touch before update on public.deliverables
  for each row execute function public.touch_updated_at();

alter table public.clients      enable row level security;
alter table public.deliverables enable row level security;

drop policy if exists clients_self on public.clients;
create policy clients_self on public.clients
  for all using (client_key = public.board_key())
  with check (client_key = public.board_key());

drop policy if exists deliverables_client on public.deliverables;
create policy deliverables_client on public.deliverables
  for all using (client_key = public.board_key() or board = public.board_key())
  with check (client_key = public.board_key());

grant select, insert, update on public.clients      to anon;
grant select, insert, update on public.deliverables to anon;

-- ---------------------------------------------------------------------
-- DELIVERABLE FILES bucket — full-quality masters of assets under review
-- (images + PDFs, 50MB). Public read; write scoped to the client folder.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deliverables','deliverables', true, 52428800,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "deliverables write own client folder" on storage.objects;
create policy "deliverables write own client folder"
on storage.objects for insert to anon
with check (
  bucket_id = 'deliverables'
  and (storage.foldername(name))[1] = public.board_key()
);
-- (no anon update/delete — masters are immutable)

-- seed the current clients
insert into public.clients (client_key, name) values
  ('lovedust', 'LoveDust Films'),
  ('ruth', 'Ruth Pedida')
on conflict (client_key) do nothing;

select client_key, name from public.clients order by created_at;
