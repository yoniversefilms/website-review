-- =====================================================================
-- Website Review — NEW-NOTE NOTIFICATION  (run once in the SQL Editor)
-- ---------------------------------------------------------------------
-- Emails/pings you the moment a reviewer drops a note, via a GHL Inbound
-- Webhook workflow. Pure-SQL trigger: every INSERT on public.notes POSTs a
-- flat JSON payload to GHL. Needs the pg_net extension (Database ->
-- Extensions -> enable "pg_net") and your GHL Inbound Webhook URL below.
-- Safe to re-run.
--
-- GHL side (mirrors the ghl-form-webhook SOP):
--   1. Automation -> new Workflow -> trigger "Inbound Webhook" -> copy URL.
--   2. Paste the URL into ghl_url below, run this file.
--   3. Insert one test note (any site, ?review=1) so GHL captures the sample
--      payload, then map fields and add a "Send Email" / internal notification
--      action:  {{inboundWebhookRequest.author}} left a note on
--      {{inboundWebhookRequest.site}}: {{inboundWebhookRequest.note}}
--      -> link: {{inboundWebhookRequest.review_link}}
--   4. Publish the workflow.
--
-- Notes: fires per note (fine at this scale). The payload includes a
-- ready-to-click review_link that opens the site in review mode.
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.notify_new_note() returns trigger
language plpgsql security definer as $$
declare
  ghl_url text := 'PASTE_YOUR_GHL_INBOUND_WEBHOOK_URL';  -- keep the real URL OUT of the repo (it's a secret)
begin
  if ghl_url like 'PASTE_%' then return NEW; end if;   -- not configured yet: no-op
  perform net.http_post(
    url := ghl_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',       'new_review_note',
      'site',        NEW.project_key,
      'author',      coalesce(NEW.author, 'someone'),
      'note',        NEW.body,
      'page_url',    NEW.page_url,
      'section',     NEW.section_id,
      'quoted',      NEW.target_text,
      'layout',      case when coalesce(NEW.viewport_w,0) = 0 then 'unknown'
                          when NEW.viewport_w < 768 then 'mobile' else 'desktop' end,
      'review_link', 'https://' || NEW.project_key || coalesce(NEW.page_url, '/') || '?review=1',
      'created_at',  NEW.created_at
    )
  );
  return NEW;
exception when others then
  return NEW;   -- notification failure must NEVER block the reviewer's save
end $$;

drop trigger if exists notes_notify on public.notes;
create trigger notes_notify after insert on public.notes
  for each row execute function public.notify_new_note();
