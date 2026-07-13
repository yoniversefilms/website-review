# Pixeldust Review OS — Master Plan

_The review tool grows into the factory's review hub: every deliverable (site, doc,
image, deck) reviewed in one place, triaged to Claude, gated by PRs, shipped, and
mirrored to a clean client portal. Planned 2026-07-12 · status: awaiting Yonatan's
approval on the Decisions section. Nothing here is built yet._

---

## 1. The one core insight

**Everything becomes a reviewable page.** Websites are reviewed live (`?review=1`).
Docs, images, and decks get rendered to **proof pages** (simple HTML on our GitHub
Pages) — and the **same `embed.js` widget** annotates all of them. One annotation
engine, one data model, one dashboard for every deliverable type the factory makes.
No new review tech is ever needed per asset type; only a proof-page renderer.

---

## 2. State machine (the four tabs)

Tabs track **notes/fixes** (his mental model: each piece of feedback moves through
states). A deliverable's own state is a rollup badge computed from its notes.

```
                        ┌────────────────────────────────────────────┐
                        │                                            ▼
 client note ──► UNDER REVIEW ──Fix(+instruction)──► SCHEDULED ──Claude builds──► BUILT
                    │   ▲                                ▲            (PR open)     │
                  Park  └── unpark                       │                ┌─────────┤
                    ▼                                    └──── FLAGGED ◄──┘ 🚩      │ Approve
                 (parked, internal-only filter)            (reason appended,        ▼
                                                            auto-rescheduled)   MERGED ──► SHIPPED ──► client sees
                                                                                  (PR)      (deploy/     "Updated ✓"
                                                                                             paste)
```

- **Under review** — new feedback, untriaged (`status=open, disposition=null`)
- **Scheduled** — queued for Claude (`disposition=fix` + `owner_note`)
- **Built** — Claude finished; a `run` exists with summary + PR; awaiting verdict
- **Flagged** — Yonatan rejected the build; flag reason is appended to the note's
  instruction and it returns to Scheduled for the retry
- **Parked** — filter chip inside Under review, not a 5th tab
- **Shipped** — post-merge deploy done; only now does `resolved` flow to the reviewer

---

## 3. Data model evolution (Supabase, backward-compatible)

New tables (existing `projects/notes/comments/attachments` untouched — the live
widget keeps working):

| Table | Key columns | Purpose |
|---|---|---|
| `clients` | `client_id` (slug), `name`, `locale` (he/en), `portal_key` (UUID) | one row per client; portal_key is the client link capability |
| `deliverables` | `id`, `client_id`, `type` (website/doc/image/deck), `title`, `board` →projects, `proof_url`, `repo`, `state`, `version` | the unit cards/tabs are about |
| `runs` | `id`, `deliverable_id`, `note_ids[]`, `summary`, `files_changed`, `pr_url`, `status` (open_pr/merged/flagged/shipped), `flag_reason` | **the Claude action log** the drawer shows |
| `messages` | `id`, `deliverable_id`, `note_id?`, `author` (yonatan/claude), `body`, `task_state` (pending/picked_up/done) | the "Ask Claude" channel |

`notes` gains `deliverable_id` (nullable; legacy board-keyed notes keep working).
Client visibility: a Postgres **view without triage columns** (no disposition,
owner_note, runs internals) — the portal queries only the view, so hiding is
enforced at the DB, not just the UI.

---

## 4. Internal dashboard v2 (Yonatan's cockpit)

```
┌──────────┬──────────────────────────────────────────────┬──────────────────────┐
│ CLIENTS  │  [Under review 12] [Scheduled 4] [Built 2🔔] │  DETAIL DRAWER       │
│ ● All    │  [Flagged 1]           search 🔍  filter ▾   │  ── deliverable hdr  │
│ ● Ruth   │  ┌─────────┐ ┌─────────┐ ┌─────────┐         │  [Open live] [Proof] │
│ ● Lovedust│ │ 🖥 site  │ │ 📄 brand │ │ 🖼 hero  │        │  ── notes + threads  │
│ + new    │  │ thumb    │ │ guide    │ │ image    │        │  ── 🤖 Claude runs:  │
│          │  │ 3 open   │ │ 1 open   │ │ ✓ built  │        │     summary, files,  │
│          │  └─────────┘ └─────────┘ └─────────┘         │     [PR #12 diff]    │
│          │                                              │  [✓ Approve & Merge] │
│          │  activity feed (bottom strip)                │  [🚩 Flag: reason…]  │
│          │                                              │  ── Ask Claude [___] │
└──────────┴──────────────────────────────────────────────┴──────────────────────┘
```

Drawer contents (per deliverable): header + open-live/proof buttons → notes with
threads + Fix/Park → **Claude activity timeline** (each run: summary, files changed,
PR link + diffstat) → **PR panel** (Approve & Merge / Flag with reason) → **Ask
Claude** input (writes to `messages`). Bulk-select notes → "Fix all with one
instruction". Keyboard: j/k cards, enter opens drawer, f=fix, p=park.

---

## 5. Client portal (`portal.html?c=<portal_key>`)

- **Login:** password `pds`, case-insensitive (lowercase-compare), stored per device
  in localStorage after first entry. **Honest framing:** this is a branding gate,
  not security — the real protection is the unguessable per-client `portal_key` URL.
  Acceptable for review assets; anything sensitive gets a UUID board (existing path).
- **Their dashboard:** brand header, deliverable cards with thumbnails; statuses in
  client language only — **"In review" / "We're on it" / "Updated — take a look ✓"**.
  Never Fix/Park/Resolved, never PRs, never Claude internals, never other clients.
- Click a card → website opens live with `?review=1`; doc/image opens its proof page
  with the same widget. Mobile-first; RTL respected per client locale.
- Notify loop: on Shipped, GHL email to the client ("your site was updated") using
  the existing webhook pattern.
- Onboarding: internal dashboard "＋ new client" → creates row + portal link to send.

---

## 6. The Claude channel — three honest maturity stages

| Stage | How it works | Terminal? |
|---|---|---|
| **A — now** | "Fix with Claude" copies the prompt; paste into Claude Code | one paste |
| **B — next** | Dashboard writes to `messages`/FIX queue; a **scheduled Claude agent** (cloud schedule or local cron) polls every N hours: pulls tasks → builds → opens PRs → writes `runs` + replies back. Dashboard shows results. | **zero** |
| **C — later** | "Run now" button → GitHub Actions dispatch → same loop on demand | zero |

Stage B is the one that makes the "Ask Claude" box real: you type into the drawer,
the agent answers on its next run, threaded under the deliverable.

---

## 7. PR-before-merge + the deploy reality

- **Repo per client** (`pixeldust-<client>`, private), deliverables as folders.
  One-time migration: `git init` Ruth's + Lovedust's site folders and push.
- Claude builds on branch `fix/<deliverable>-<yyyymmdd>-<n>`, opens a PR whose body
  lists the note IDs + before/after proof links. Never commits to main directly.
- Drawer shows the PR: diffstat, summary, [View on GitHub], **[Approve & Merge]**,
  **[🚩 Flag]** (reason required; flag re-schedules with the reason appended).
- **Deploy after merge — the honest part:** GHL pages can't be pushed to. Post-merge
  the drawer shows a **Ship checklist**: ① Copy updated block (button) ② GHL →
  Settings → Tracking Code → paste ③ Publish ④ Mark Shipped. Pages-hosted assets
  ship automatically on merge. `resolved` reaches the reviewer only at Shipped —
  so a client is never told "done" before it's actually live.
- Rollback = revert PR. Version history = git tags per deliverable (v1, v2…).

---

## 8. What you didn't ask for but need (the gaps)

1. **Before/after proofs** on every Built item — you approve visuals, not prose.
2. **Ship-checklist enforcement for GHL** — the manual paste is the #1 silent-failure point; make "Shipped" impossible to skip.
3. **Internal-only notes** on any item (things clients must not see).
4. **Photo uploads in notes** (bucket exists; clients will want to attach references).
5. **Card thumbnails** (auto-screenshot of proof/live pages) — the grid is unusable without them at 20+ deliverables.
6. **Activity feed + audit trail** — who did what when, per client (clients ask).
7. **Client-facing change log** ("what we changed this week") — retention gold.
8. **Staleness nudges** — "note untouched 5 days" indicator + weekly digest email.
9. **Bulk triage** — six notes, one instruction, one click.
10. **Search across all clients/notes** — day one it's nice, month three it's oxygen.
11. **Archive state** for finished projects (keeps tabs clean).
12. **Per-client notification prefs** (language, cadence) — Ruth gets Hebrew emails.

---

## 9. Build phases (each independently shippable)

| # | Phase | Ships | Est. |
|---|---|---|---|
| 1 | **Tabs + Drawer** on current dashboard | The 4 state tabs mapped from existing data; detail drawer with notes/threads/Fix/Park + manual runs log; flag button | 3–4h |
| 2 | **Deliverables + clients layer** | clients/deliverables/runs tables; proof-page renderer for docs & images; thumbnails | 4–6h |
| 3 | **Client portal** | pds gate, portal links, client-language statuses, notify-on-update, RTL | 4–6h |
| 4 | **PR gate** | repos for Ruth + Lovedust; branch/PR flow; drawer PR panel + Approve/Flag; ship checklist | 5–8h |
| 5 | **Claude channel B** | messages/tasks + scheduled agent → fully terminal-free loop | 4–6h |
| 6 | **Ops polish** | search, bulk triage, activity feed, staleness, archive | ongoing |

Order is deliberate: 1 changes your daily flow tomorrow; 2–3 make it client-ready;
4–5 make it safe and hands-free.

---

## 10. Decisions — LOCKED 2026-07-12 ("go with your recs")

1. **Tabs track notes**; deliverable shows a rollup badge. ✔
2. **Parked = filter chip**, not a 5th tab. ✔
3. **One repo per client.** ✔
4. **Stage-B agent = Claude Code scheduled cloud task.** ✔
5. **Client sees only "In review" / "Updated ✓".** ✔
6. **Domain later** (CNAME `review.pixdust.io` when cosmetic time allows). ✔
7. **Loader-per-site** for content (paste once, ship via merge); pin version on handoff. ✔

## 11. Additions from Yonatan's walkthrough (2026-07-12)

- **R1 — Repo preview in the internal dash:** the Built drawer shows a **side-by-side of
  repo `main` (current live) vs the fix branch**, both rendered as preview pages from the
  repo (same-origin iframes — avoids GHL's iframe restrictions entirely). Approve = ✓
  checkmark; or type a text change request instead (which becomes the flag/retry).
- **R2 — Role-scoped annotation tools:** internal previews load the widget with ALL tools
  (pin, draw, box, text-highlight — box/highlight capture code restored, gated by a
  `tools` config the loader/URL sets). **Clients keep pin + draw only.**
- **R3 — Live loop, no manual refresh:** dashboard polls (~12s while visible) + refetch
  on focus, so new notes / Claude run summaries / replies appear on their own. True
  realtime broadcast (Realtime Authorization) stays a later upgrade — the WS doesn't
  carry our RLS header (known limitation from Phase-1 testing).
- **Flagged-tab storage (Phase 1):** `notes.flag_reason` column — Flag (reason required)
  sets flag_reason + reopens + re-queues (disposition=fix); shows in the Flagged tab
  until Claude's next successful resolution clears it. Claude sees "🚩 Previous attempt
  flagged: <reason>" in the FIX QUEUE.

**Phase 1 (building now):** dashboard v2 — 4 state tabs + Parked chip, right detail
drawer (thread + reply-from-dashboard, Fix/Park/Unqueue, Approve/Flag per state),
flag_reason migration, live polling. Runs/messages/clients/deliverables tables = Phase 2.
