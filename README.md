# Website Review Tool

Reusable visual-feedback embed for websites you build. A reviewer opens a share-link and
annotates the live page — **point pins** and **text highlights** (box + freehand later),
with **photo attachments** and notes, **no login**. Feedback syncs into a file in the
site's repo that **Claude Code reads and turns into edits you approve** before they ship.

Reuses the HomeApp (`sc-rentals`) stack: static HTML, `supabase-js` via CDN, no build
step, public publishable key + Row-Level Security, a capability-URL "board" per project,
realtime, and a localStorage offline cache.

See **[PLAN.md](PLAN.md)** for the full design and rationale.

## Supabase project

- Project: **Website Review v1** — `https://vfdhlrikxcdturtvyxel.supabase.co`
- Browser key: the **publishable** key (`sb_publishable_…`), in [config.js](config.js).
  The **secret** key is never used client-side.

## Setup (once)

1. In the **SQL Editor**, paste **[schema.sql](schema.sql)** and **Run**. The final
   statement provisions the Ruth project and returns its `project_key` — **copy it**.
   (Lost it? Run `select project_key, name from public.projects;`.)
2. `config.js` already holds the Project URL + publishable key.

## Use (once the widget lands — Phase 2+)

- Paste the embed snippet into the reviewed site's `index.html` (before `</body>`).
- Send the reviewer: `https://<site>/?review=<project_key>`
- Pull feedback for Claude:  `node sync.mjs ruth`         *(Phase 3)*
- Push resolved status back:  `node sync.mjs ruth --push`  *(Phase 4)*

## Build status

- [x] **Phase 0** — `schema.sql`: data model, RLS, storage, realtime
- [x] **Phase 1** — Supabase round-trip smoke test (`smoke-test.html`) — verified 6/7
- [x] **Phase 2** — widget (`embed.js`): pin capture, end-to-end on the Ruth site — verified
- [ ] **Phase 3** — `sync.mjs` pull → `feedback.md` → Claude proposes an edit
- [ ] **Phase 4** — approve + push status back (reviewer sees "resolved" live)
- [ ] **Phase 5** — text-highlight tool + photo uploads
- [ ] **Phase 6** — box + freehand tools, console/dashboard, hardening

## Security model (honest)

Capability-URL: the project key in the reviewer link **is** the access credential — treat
it like a password. The publishable key is public by design; RLS + the key are the whole
boundary. One key per project means the reviewer's browser technically *can* change status
or delete notes (the owner/reviewer split is UI-only in v1) — fine for a founder + a few
trusted reviewers. Details and the upgrade path (Supabase Auth) are in `PLAN.md §8`.
