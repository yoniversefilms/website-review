# Website Review Tool

Reusable visual-feedback embed for websites you build. A reviewer opens a share-link and
annotates the live page — **point pins** with notes and (soon) photos, **no login**.
Feedback syncs into a file in the site's repo that **Claude Code reads and turns into
edits you approve** before they ship, then "resolved" flows back to the reviewer.

Reuses the HomeApp (`sc-rentals`) stack: static HTML on GitHub Pages, `supabase-js` via
CDN, no build step, public publishable key + Row-Level Security, a "board" per site, and
a localStorage offline cache.

See **[PLAN.md](PLAN.md)** for the full design and rationale.

## How it's wired

- **Hosted at** `https://yoniversefilms.github.io/website-review/` (repo Pages).
- **One universal block** (`ghl-review-loader.html`) is pasted into a site's
  **GHL → Settings → Tracking Code → Body** (Save + Re-publish). It's dormant for normal
  visitors and loads nothing until the URL has `?review` (e.g. `?review=1`).
- **Board = the site's own domain** — no per-site key; the widget self-registers the board
  on first use. Because the block loads `embed.js` from Pages, improving the widget updates
  every site with no re-paste.

## Supabase project

- **Website Review v1** — `https://vfdhlrikxcdturtvyxel.supabase.co`
- Browser key: the **publishable** key (`sb_publishable_…`) in [config.js](config.js).
  The **secret** key is never used client-side.

## Setup (once, in the SQL Editor)

1. Run **[schema.sql](schema.sql)** — tables, RLS, storage, realtime.
2. Run **[migrate-universal-snippet.sql](migrate-universal-snippet.sql)** — lets a site
   self-register its board.
3. Run **[hardening.sql](hardening.sql)** — locks down destructive writes (see below).
4. Run **[fix-park.sql](fix-park.sql)** — owner triage columns (disposition/owner_note).
5. Run **[review-os-core.sql](review-os-core.sql)** — clients + deliverables + the
   50MB `deliverables` files bucket (proof pages for PDFs/images/decks).
6. Optional: run **[notify.sql](notify.sql)** — pings a GHL Inbound-Webhook workflow on
   every new note (email with a click-to-review link). Enable `pg_net` first and paste
   your webhook URL into the file.

## Owner vs client

Open any review link once with **`&owner=1`** to mark that browser as owner (triage UI:
Fix/Park/Resolve + ▭ Box/🖍 Text tools). Clients get plain `?review=1`: Pin, Draw,
replies, photos, and green resolved pins — nothing else. `&owner=0` un-claims.

## Sync for Claude (auto-discovery)

`node sync.mjs` with **no arguments** pulls **every** board that has notes — any site
where the block is pasted shows up automatically. That needs the Supabase **secret** key
in the gitignored file `reviews/secret.local.json`:

```json
{ "secretKey": "sb_secret_..." }
```

(Dashboard → Settings → API Keys → Secret keys. NEVER commit it or put it in the
browser.) Without it, single-board pulls still work: `node sync.mjs <domain-or-slug>`.

## Use

- Paste the loader block (`ghl-review-loader.html`) into the site; send the reviewer the
  site URL + `?review=1`.
- Pull feedback for Claude:   `node sync.mjs <slug>`
- Push resolved status back:  `node sync.mjs <slug> --push`  (edit only `feedback.json`)
- Re-pull discarding local edits: `node sync.mjs <slug> --force`

## Build status

- [x] **Phase 0** — `schema.sql`: data model, RLS, storage, realtime
- [x] **Phase 1** — Supabase round-trip smoke test — verified
- [x] **Phase 2** — widget (`embed.js`): pin capture, hosted, universal snippet — verified
- [x] **Phase 3** — `sync.mjs` pull → `feedback.md` → Claude proposes an edit — verified
- [x] **Phase 4** — conflict-safe push of status/resolution back to the reviewer — verified
- [x] **Hardening** — column-scoped writes, append-only comments, locked storage, prompt-injection fencing
- [ ] **Phase 5** — text-highlight tool + photo uploads
- [ ] **Phase 6** — box + freehand tools, dashboard, new-note notification

## Security model (honest)

**The board key is the site's public domain by design** — it is *not* a secret. That's the
price of the zero-setup universal snippet: RLS scopes each request to one board, but anyone
who views a site's page source (or guesses the domain) can, with the public publishable key,
**read that board's feedback and post notes to it**. That's an accepted trade-off for
low-sensitivity marketing-site review.

`hardening.sql` removes the *destructive* exposure: strangers can no longer rewrite note
bodies/authors (UPDATE is column-scoped to status/resolution), wipe comments or photos
(append-only + upload-only storage), or host arbitrary files (image/≤5 MB bucket limits).

Reviewer text is treated as **untrusted data**: `feedback.md` fences every reviewer field
and carries a trust-boundary preamble, so a note can't smuggle instructions to Claude.

**If a client's feedback needs real confidentiality:** give that site a secret UUID board
instead of the domain — pass it via `?board=<uuid>`, `data-review-key`, or
`WR_CONFIG.projectKey` — and treat that reviewer link as the password. Works today, no code
change. Full details and the Supabase-Auth upgrade path are in `PLAN.md §8`.
