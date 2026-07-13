-- =====================================================================
-- Website Review — SECURITY HARDENING  (run once in the Supabase SQL Editor)
-- ---------------------------------------------------------------------
-- Reduces the blast radius of the universal-snippet model (board key = the
-- site's PUBLIC domain, so RLS alone can't keep strangers out). This stops
-- note-body/author REWRITING and comment/photo WIPING by anyone who knows a
-- site's domain. READ + INSERT stay open by design (zero-setup); a client that
-- needs real confidentiality uses a secret UUID board instead (see PLAN.md §8).
-- Safe to re-run.
-- =====================================================================

-- 1) NOTES — keep full INSERT, but restrict UPDATE to the workflow columns +
--    body. Kills anonymous rewriting of author/target/geometry, while allowing
--    the widget's "resolve", `sync.mjs --push`, and edit-your-own-note (all of
--    which touch only status/resolution/updated_by/body). Body-edit is UI-gated
--    to the author; at the DB level a domain-scoped caller can edit a body —
--    same accepted tier as posting/deleting a note (see PLAN.md §8).
revoke update on public.notes from anon;
grant  update (status, resolution, updated_by, body) on public.notes to anon;

-- 2) COMMENTS / ATTACHMENTS are append-only — remove anon DELETE (no client
--    code deletes them; it was pure attack surface).
revoke delete on public.comments    from anon;
revoke delete on public.attachments from anon;
-- (NOTE delete stays granted: a reviewer deleting their own note is an intended
--  feature. Accepted, documented risk at this scale — recoverable, low-value.)

-- 3) STORAGE — reviewers only need to UPLOAD. Remove anon overwrite/delete so a
--    stranger who knows the domain can't wipe or replace a board's photos.
drop policy if exists "review update own project folder" on storage.objects;
drop policy if exists "review delete own project folder" on storage.objects;

-- 4) STORAGE bucket — images only, max 10 MB. Prevents arbitrary HTML/JS or
--    large-file hosting under your Supabase project. (The widget re-encodes
--    oversized/exotic camera formats to JPEG client-side before upload.)
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
 where id = 'review-photos';

-- 5) Housekeeping — drop throwaway test boards (cascades to their notes).
delete from public.projects
 where project_key like 'verify-%'
    or project_key in ('localhost', 'migration-test');

-- Verify the note grants landed (expect: INSERT + DELETE table-wide, UPDATE only
-- on status/resolution/updated_by):
select privilege_type, string_agg(column_name, ',' order by column_name) as cols
  from information_schema.column_privileges
 where grantee = 'anon' and table_name = 'notes'
 group by privilege_type
 order by privilege_type;
