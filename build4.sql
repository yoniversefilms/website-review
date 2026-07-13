-- =====================================================================
-- BUILD 4: the PR loop — clients.repo + explicit notes UPDATE grant.
-- Safe to re-run.
-- =====================================================================

-- Which GitHub repo holds each client's source (owner/name).
alter table public.clients add column if not exists repo text;
update public.clients set repo = 'yoniversefilms/pixeldust-lovedust' where client_key = 'lovedust';

-- Refresh the column-scoped UPDATE grant, explicitly including flag_reason
-- (the dashboard's Flag button and PR-flag requeue write it).
revoke update on public.notes from anon;
grant update (status, resolution, updated_by, body, disposition, owner_note, flag_reason)
  on public.notes to anon;

select client_key, name, repo from public.clients order by client_key;
