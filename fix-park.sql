-- =====================================================================
-- Website Review — FIX / PARK triage columns  (run once in the SQL Editor)
-- ---------------------------------------------------------------------
-- Adds the owner-triage layer: disposition ('fix' = queued for Claude,
-- 'parked' = saved for later, NULL = untriaged) and owner_note (Yonatan's
-- instruction to Claude for that note). Widens the column-scoped UPDATE
-- grant so the widget + dashboard can set them. Safe to re-run.
-- =====================================================================

alter table public.notes add column if not exists disposition text
  check (disposition in ('fix','parked') or disposition is null);
alter table public.notes add column if not exists owner_note text;

-- widen the hardened column-scoped UPDATE grant (replaces the previous one)
revoke update on public.notes from anon;
grant  update (status, resolution, updated_by, body, disposition, owner_note)
  on public.notes to anon;

-- verify (expect UPDATE row: body,disposition,owner_note,resolution,status,updated_by)
select privilege_type, string_agg(column_name, ',' order by column_name) as cols
  from information_schema.column_privileges
 where grantee = 'anon' and table_name = 'notes' and privilege_type = 'UPDATE'
 group by privilege_type;
