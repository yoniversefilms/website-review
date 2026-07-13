-- =====================================================================
-- Website Review — FLAG/RETRY column  (run once in the SQL Editor)
-- ---------------------------------------------------------------------
-- flag_reason: Yonatan rejected Claude's fix; the reason travels with the
-- note back into the FIX QUEUE (disposition=fix) so the retry addresses it.
-- Cleared (null) by Claude's next successful resolution. Safe to re-run.
-- =====================================================================

alter table public.notes add column if not exists flag_reason text;

-- widen the column-scoped UPDATE grant (replaces the previous one)
revoke update on public.notes from anon;
grant  update (status, resolution, updated_by, body, disposition, owner_note, flag_reason)
  on public.notes to anon;

-- verify (expect: body,disposition,flag_reason,owner_note,resolution,status,updated_by)
select string_agg(column_name, ',' order by column_name) as update_cols
  from information_schema.column_privileges
 where grantee = 'anon' and table_name = 'notes' and privilege_type = 'UPDATE';
