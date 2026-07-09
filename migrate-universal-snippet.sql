-- =====================================================================
-- ONE-TIME migration: enable the "universal snippet" model.
-- Run this ONCE in the Supabase SQL Editor (you already ran schema.sql).
-- After this, adding a new site = paste the same block, nothing else.
-- =====================================================================
-- A site self-registers its OWN board (keyed by its domain). Self-insert is
-- scoped to the key the caller presents, so a site can only create/read/update
-- its own board — never another's. (The key is the public domain: this is
-- capability-by-obscurity, chosen deliberately for zero per-site setup.)

drop policy if exists projects_self_insert on public.projects;
create policy projects_self_insert on public.projects
  for insert with check ( project_key = public.board_key() );

grant insert on public.projects to anon;
