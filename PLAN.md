# Website Review Tool — Build Plan

_A reusable visual-feedback embed for sites you build. Reviewers annotate the live
page; their notes sync into a file Claude reads, turns into edits, and you approve
before anything ships._

Status: **approved — building** · Last updated: 2026-07-08

---

## 1. What we're building

A small **embed snippet** you paste into any site you control (starting with the Ruth
site). It gives a reviewer (e.g. Ruth, or a client) a floating toolbar to leave
**located feedback** on the live page — pin a spot, highlight a sentence, box an area,
scribble — plus **attach photos** and type a note. No login: they get a share-link.

Everything reuses your HomeApp (`sc-rentals`) stack: static HTML, `supabase-js` over
CDN, **no build step**, the public publishable key + Row-Level Security, a capability-URL
"board" per project, realtime, and a localStorage offline cache.

**The differentiator** (your requirement): the feedback doesn't just sit in a
dashboard. It **syncs down into a file in the site's repo that Claude Code reads**,
digests, and turns into concrete edits to `index.html` — which **you approve or modify**
before they ship. Then "resolved" flows back up so the reviewer sees their note is done.

---

## 2. The loop (the whole point)

```
Reviewer (share-link)  --annotate + photo-->  Supabase (notes + photos)
      ^                                            |  node sync.mjs ruth (pull)
      | realtime "Resolved ✓"                      v
 Yonatan (approve) <-- Claude edits <-- reviews/ruth/feedback.md (+ .json, photos)
      |
      +-- node sync.mjs ruth --push (status back up) --> Supabase
```

One line: **reviewer annotates → Supabase → `sync.mjs` → `feedback.md` → Claude proposes
`index.html` diffs → you approve → `sync.mjs --push` → reviewer sees "Resolved ✓" live.**

---

## 3. Architecture at a glance

Everything static, hosted on GitHub Pages (like HomeApp). This tool lives in its **own
new git repo** (suggested GitHub name `website-review`). **One** Supabase project
("Website Review v1") serves **all** client review boards; rows are partitioned by
project key and isolated by RLS.

```
Website review/                     <- the tool (this repo), hosted on GitHub Pages
  embed.js            <- the widget you paste into any site (shadow-DOM, tools, photos)
  config.js           <- supabaseUrl + publishable key (browser-safe)
  schema.sql          <- run once in Supabase (tables, RLS, storage, realtime)
  smoke-test.html     <- Phase 1: proves the Supabase round-trip + RLS isolation
  sync.mjs            <- Node script: pull feedback -> repo file; push status back up
  console.html        <- (later) mint a project key + copy the snippet/link
  dashboard.html      <- (later) triage notes in a browser
  PLAN.md / README.md

Ruth/Website/                       <- a site being reviewed (the embed is pasted here)
  index.html          <- + one <script> snippet before </body>
  reviews/ruth/
    feedback.json     <- machine source of truth (Claude diffs against this)
    feedback.md       <- human/Claude-readable mirror, grouped by section
    photos/<note>/...  <- downloaded attachments
    .sync-state.json  <- pull cursor + per-note remote updated_at (conflict detection)
```

**Two artifacts, two audiences** (same project key inside both):
- **Embed snippet** — owner -> site. Pasted once into `index.html`, stays *dormant* in
  production; activates only when the page is opened with `?review=<key>`.
- **Reviewer link** — owner -> reviewer. Just the site URL + `?review=<key>`. Opening it
  wakes the dormant widget into review mode for that one project.

---

## 4. What we reuse vs. what's new

**Reused from HomeApp, unchanged:** capability-URL board model, `x-board-key` header,
the RLS expression (`current_setting('request.headers')::json ->> 'x-board-key'`),
CDN `supabase-js`, `createClient` with the board header + `eventsPerSecond`, realtime
`postgres_changes` filtered by the project key, last-write-wins on `updated_at`,
localStorage offline cache, `config.js` holding the public key (never a secret key).

**New (didn't exist in HomeApp):**
1. A `projects` **registry** table (board becomes a first-class row, so we can validate
   keys and isolate storage per client).
2. A `notes` table rich enough to **re-locate** an annotation and describe it to Claude.
3. A Supabase **Storage bucket** for photos (HomeApp had none).
4. The **`sync.mjs`** file loop + the `feedback.{json,md}` format Claude reads.
5. A **shadow-DOM widget** with the annotation tools (HomeApp had no on-page overlay).

---

## 5. Locked design decisions

_These resolve the conflicts the design critique found. Each is the cheapest correct
choice; changing one is fine, but note the downstream effect._

- **D1 — Anchoring = 3 durable tiers, not 6.** Re-locate every note by, in order:
  **(a) nearest section id** (`#about`, `#process`... — the Ruth site has clean ones,
  incl. `#problem`), **(b) verbatim quoted text** (W3C text-quote: exact string + a bit
  of prefix/suffix), **(c) fractional bounding-box** (coords as a fraction of the anchor,
  so they survive responsive reflow). If none resolve, the note is **parked** in a
  "needs re-anchor" tray — never silently dropped, never silently mis-placed.
  - **Why we dropped the `data-review-id` scheme:** it only exists in the live DOM at
    runtime; nothing writes it back into the static `index.html` on disk, so Claude never
    sees it. Section-id + verbatim quote are the anchors that actually survive Claude
    editing the file — and they map perfectly to the dominant feedback type on a
    copy-heavy site ("change this exact sentence").
  - **No auto "re-anchor" pass.** Running the resolver against a DOM Claude just rewrote
    would confidently re-point a note at the *replacement* content. We resolve on load
    only; unresolved -> parked.

- **D2 — One `notes` table for all tool kinds,** discriminated by `kind`
  (`pin|box|text|draw`) with type-specific geometry in a `jsonb` column. Keeps RLS,
  realtime, and the sync file simple. `comments` (threaded replies, append-only) and
  `attachments` (photo metadata) are separate, mirroring HomeApp.

- **D3 — Status = 3 states + a resolution field.** `status in {open, resolved, wont_fix}`;
  a non-null `resolution` text means "Claude has proposed an edit, awaiting you." This
  gates the loop (reviewer sees `resolved` only after you push) **without** the
  incompatible 6-state machine that would fail the CHECK constraint. **This one enum is
  authoritative** — every component reads it.

- **D4 — Photos: one PUBLIC-READ bucket, unguessable UUID paths, one path convention:**
  `projects/<project_key>/<note_id>/<uuid>.jpg`. Write access is RLS-scoped to your own
  project folder; read is public (review screenshots of a site you built are
  low-sensitivity, and public URLs keep `sync.mjs` a plain GET and keep Claude's
  `feedback.md` links stable). _Tradeoff: a leaked path is world-readable. If a future
  client's shots are sensitive, flip the bucket private + signed URLs — no schema change._

- **D5 — One sync path: `sync.mjs`.** A ~30-line Node script (Node ships on your
  machine, no install) that Claude runs via Bash. Two modes: pull (`node sync.mjs ruth`)
  and push (`node sync.mjs ruth --push`). No browser "export" button (two export paths =
  two sources of drift). Uses only the public key + board header — safe to commit.

- **D6 — Direction of truth is split:** note *content* (body, target, photos) flows
  **Supabase -> file only** (the reviewer owns it; Claude never rewrites a note's text).
  *Status + resolution* flows **file -> Supabase** (you own it; pushed back so the
  reviewer sees progress). `feedback.md` is always regenerated from `feedback.json`,
  never hand-edited — one source of truth, no drift.

- **D7 — Every insert carries the project key + FK to `projects`.** An unknown/guessed
  key writes nothing (the FK rejects it), which is what makes multi-client reuse safe.

---

## 6. Data model

See **[schema.sql](schema.sql)** — the single reconciled source. Tables: `projects`
(registry), `notes` (all 4 kinds), `comments` (append-only), `attachments` (photo
metadata). RLS on every table scopes rows to the `x-board-key` header; `projects` is
read/update-only for `anon`. Storage bucket `review-photos` is public-read with
folder-scoped writes. Realtime publication + `replica identity full` on `notes`.

**Geometry per kind** (all fractions 0..1, relative to the anchor, so they reflow):
`pin {x,y}` · `box {x,y,w,h}` · `text {quote,prefix,suffix}` (no coords — re-found by the
words) · `draw {paths:[[x,y]...], stroke, width}` in a normalized viewBox.

---

## 7. The four tools

All four converge on **one anchor model** and one note composer (textarea + photo attach
+ optional priority), so they're cheap to add incrementally. Staged by value to the loop:

| Tool | Gesture | Anchors by | Phase |
|---|---|---|---|
| **Point pin** | click a spot | section id + fractional xy | **v1 (P2)** |
| **Text highlight** | select words | verbatim quote (survives edits best) | **v1 (P5)** |
| Box / region | drag a rectangle | section id + fractional rect | P6 |
| Freehand draw | scribble | normalized SVG path in anchor | P6 |

**Why pin + text first:** they carry the entire loop — pin = "this spot," text = "this
wording" — and text-quote is the anchor that best survives Claude editing the file.
Box + draw add a second geometry/canvas path that the Claude loop consumes no differently,
so they're a fast follow once the spine is proven.

**Widget essentials (v1):** shadow-DOM mount (styles can't leak either way; forced LTR
chrome docked bottom-left so it doesn't cover RTL content); a name gate on first
annotation (no login); numbered markers <-> side list <-> file two-way linking; realtime
so multiple reviewers stream in live; localStorage cache so a network blip never loses a
note (photos queue in IndexedDB, which has room; localStorage doesn't).

---

## 8. Security & honest limits (state these to any client)

**The default board key is the site's PUBLIC domain — not a secret.** This is the price of
the zero-setup universal snippet (one block on every site, `board = location.hostname`).
Consequences, stated plainly:

- **Anyone who knows a site's domain** + the public publishable key (it ships in the page)
  can present `x-board-key: <domain>` and **read that board's feedback and post notes to
  it.** RLS still scopes each request to one board, but the "capability" isn't secret, so
  cross-board *isolation* holds only against people who don't know the domain (i.e. nobody).
  Accepted trade-off for low-sensitivity marketing-site review.
- **`hardening.sql` removes the destructive exposure** (the part that isn't acceptable):
  UPDATE on `notes` is column-scoped to `status/resolution/updated_by` (no rewriting note
  bodies/authors); `comments`/`attachments` are append-only (no anon DELETE); storage is
  upload-only with image/≤5 MB limits (no wiping/overwriting photos, no arbitrary file
  hosting). Note *delete* stays open (a reviewer removing their own note is intended;
  recoverable, low-value — documented accepted risk).
- **Reviewer text is untrusted data.** Anyone can post a note, and `feedback.md` is read by
  Claude — so every reviewer field is fenced as data with a trust-boundary preamble, and
  side-effectful requests found in notes must be surfaced to Yonatan, never executed.
- **Publishable key is public by design** — safe to ship; RLS + the hardening above are the
  boundary. The policies must exist before any real data.

**When a client needs real confidentiality:** give that site a **secret UUID board** instead
of the domain — pass it via `?board=<uuid>`, `data-review-key`, or `WR_CONFIG.projectKey`,
and treat the reviewer link as the password. The widget already prefers those overrides
ahead of the hostname; `schema.sql §9` still mints UUID project keys. No code change needed.
Clean further upgrade for named logins: Supabase Auth magic-link + swap RLS from the header
key to `auth.uid()`.

---

## 9. Build order (see the loop working in week 1)

**Phase 0 — reconciled `schema.sql` — DONE.** Tables + RLS + storage policy + grants +
realtime + `replica identity full`. Ruth project provisioned via the SQL Editor.

**Phase 1 — Prove Supabase round-trips (`smoke-test.html`) — DONE (6/7).** createClient
with the board header; insert / select / RLS-isolation (wrong key → 0 rows) all pass
against the live DB. **Finding:** realtime live-push did NOT deliver — the `x-board-key`
capability header rides on REST calls but not on the realtime WebSocket, so realtime's
RLS check can't see the board key. Non-critical: the core loop uses no realtime, and the
widget will **refetch-on-load + on-focus** instead. Instant updates, if wanted, come later
via a DB-trigger **broadcast** (Realtime Authorization) that doesn't depend on header RLS
— deferred to Phase 6. (HomeApp shares this latent limitation; its docs call realtime
"optional.")

**Phase 2 — Widget: pin capture, end to end (~2 days).** Shadow-DOM mount on the Ruth
site, one pin tool, name gate, composer, save to Supabase + localStorage, render pins on
load by section id. **First visible milestone.**

**Phase 3 — `sync.mjs` pull -> `feedback.md` -> Claude proposes an edit (~1 day).** Run
`node sync.mjs ruth`, get `feedback.{json,md}` + photos in `Ruth/Website/reviews/ruth/`,
have Claude read it and propose one real `index.html` edit anchored by section id.
**This is the moment the differentiator is proven.**

**Phase 4 — Close the loop: approve + push status (~1 day).** You approve the diff; flip
status in `feedback.json`; `node sync.mjs ruth --push`; the reviewer's pin shows
"Resolved" live.

**Phase 5 — Text-highlight + photos (~2 days).** Text-quote anchoring + the Storage
upload path + IndexedDB offline photo queue.

**Phase 6 — Harden + widen (ongoing).** Box + freehand tools, `console.html` +
`dashboard.html` for multi-project, per-host CSP check, orphaned-attachment cleanup,
mobile de-clustering, parked-anchor tray polish.

---

## 10. Decisions (locked 2026-07-08)

- **Tool staging (O1):** pin + text-highlight first; box + freehand in Phase 6.
- **Photo bucket (O2):** public-read, unguessable UUID paths.
- **Hosting (O3):** a new dedicated git repo for the review tool (suggested GitHub name
  `website-review`); one Supabase project ("Website Review v1",
  `vfdhlrikxcdturtvyxel`) serves all client boards.
