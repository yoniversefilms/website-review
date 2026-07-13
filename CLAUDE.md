# Website Review Widget — session onboarding

Reusable no-login visual-feedback tool: a reviewer opens a capability URL, drops pins/notes
on the live page, feedback syncs into the repo as files a session turns into fixes. Built
against the Ruth site first; also packaged as a GoHighLevel block (`ghl-review-block.html`).
Repo: github.com/yoniversefilms/website-review.

## Where things stand
- Phases 0–2 DONE and verified: schema, smoke test, pin widget.
- Phase 3 OPEN: sync-to-Claude loop (sync.mjs pulls Supabase feedback → `feedback/*.md`).
- Later: highlights + photo uploads (needs the storage bucket).

## Stack & keys
- Supabase project `vfdhlrikxcdturtvyxel.supabase.co`: publishable key ships in the widget
  (RLS scopes rows to capability tokens); the SERVICE key is sync-only, lives in `.env`,
  never ships to a browser, never gets committed, never appears in chat or task files.
- `embed.js` = the widget (vanilla JS, one script tag). `sync.mjs` = Node puller.

## Rules
- The capability URL IS the permission — no login flows, don't add any.
- Test against a real page render, not just the schema (pins are position-sensitive).

## State stamping
`tower/status.json` is machine-written for the session dashboard. Don't edit; don't commit.

## Session handoffs
On resume: read docs/sessions/latest/HANDOFF.md if it exists (else the newest
docs/sessions/<date>-*/HANDOFF.md) BEFORE doing anything else, and set
"handoff_ready": false in tower/status.json once read. At ~80% context, run
the handoff skill.
