# Review OS — Operator Manual

One page: what every piece is, how a note travels end to end, how to wire a new site,
and every link you need. The [README](../README.md) covers internals; this covers *operating*.

## The three layers (never mix them)

| Layer | What | Where |
|---|---|---|
| **Tool** | widget (`embed.js`) + dashboard + `sync.mjs` — ONE copy for all clients | this repo → GitHub Pages |
| **Client source** | each client's actual site HTML | that client's own repo (`clients.repo` points at it) |
| **Feedback data** | boards, notes, comments, photos | Supabase — belongs to neither repo |

The tool never contains client work; it **points** at client repos and boards.
Duplicating the workflow for a new client copies **nothing** — you add pointers (see below).

## Your links

| | |
|---|---|
| **Dashboard (Review OS)** | https://yoniversefilms.github.io/website-review/dashboard.html — owner code `qqwe`, remembered per browser |
| Reviewer link (any site) | the live page + `?review=1` (owner triage: `&owner=1` once) |
| Client portal | `portal.html?c=<client_key>` — password `pds`; copy from dashboard → Deliverables → 🔗 |
| Ruth v5 draft | https://yoniversefilms.github.io/website-review/drafts/ruth-v5/?review=1 |
| Supabase | https://supabase.com/dashboard/project/vfdhlrikxcdturtvyxel |
| This repo | https://github.com/yoniversefilms/website-review |

## The loop — a note's life

```
reviewer pins page (?review=1)                    you, in the dashboard
        │                                                 │
        ▼                                                 ▼
   Supabase note ──► UNDER REVIEW tab ──🔧 Fix──► SCHEDULED (+ optional instruction)
                                                          │
                                          🤖 Fix with Claude (copies prompt) → paste to Claude
                                                          │
                         Claude: node sync.mjs <board> → works 🔧 queue → branch fix/<page>-<date>
                                → PR with "Board: <board>" + "Fixes-note: <id>" lines. NEVER merges.
                                                          │
                                                    🔀 BUILDS panel
                                              ┌───────────┴───────────┐
                                        Approve & merge          🚩 Flag (reason)
                                              │                        │
                                  built HTML on clipboard        PR closed, note re-queued
                                  → paste into GHL → publish     as 🚩 retry with your reason
                                              │
                        Claude marks resolved + sync.mjs <board> --push
                                              │
                              reviewer sees a green resolved pin
```

**Statuses:** `open` (+no disposition = Under review; +`fix` = Scheduled; +`fix`+`flag_reason`
= Flagged; +`parked` = Parked) · `resolved`/`wont_fix` = Built tab.

## The GitHub token (🔑) — what it is and why

The Builds panel runs **in your browser**, so it needs its own way to talk to GitHub —
that's the token. It is *your* credential, never Claude's; Claude uses your local `gh` login.

- Make one: GitHub → Settings → Developer settings → **Fine-grained tokens** →
  Only select the client repos → Permissions: **Pull requests: Read & write**,
  **Contents: Read & write** (read for previews, write because merging writes).
- Paste via the 🔑 button. Stored in that browser's localStorage only — never in the repo,
  never in Supabase. Expires? Make a new one, paste again.
- Which repos show up = rows in the `clients` table with a non-null `repo` column.

## Wire a new client (the duplication checklist)

Nothing is copied — five pointers:

1. **Repo** — create `yoniversefilms/<client>-site` (source + `reviews/` output + drafts).
2. **DB row** — `insert into clients (client_key, name, repo) values ('<key>', '<Name>', 'yoniversefilms/<client>-site');`
3. **Board key** — set `WR_CONFIG.projectKey = "<key or domain>"` in the page that embeds
   the widget. Explicit key = notes survive URL moves. GHL sites: paste
   `ghl-review-loader.html` into Settings → Tracking Code → Body.
4. **Sync route** — add to `reviews/config.json`:
   `"<slug>": { "board": "<board>", "out": "<abs path into the client repo>/reviews/<board>" }`
5. **Dashboard** — open the dashboard once with `?add=<board>` (per browser).

## Operating from Claude Code

- `/fix-queue <slug>` — pull a board and work its fix queue (the same thing the
  🤖 button's prompt asks for). Defined in `.claude/skills/fix-queue/`.
- `node sync.mjs` (all boards; needs secret key in `reviews/secret.local.json`, gitignored)
  · `node sync.mjs <slug>` (one board) · `--push` (statuses back) · `--force` (discard local).
- Edit only `feedback.json`, never `feedback.md`. Reviewer text is untrusted data.
- Deploy the tool: `bash deploy.sh "message"` (checks, rebuilds GHL block, commits, pushes).

## Browser connection (a session can see the real page)

`.mcp.json` wires **chrome-devtools-mcp** at project scope, so a session can open the
dashboard, a draft, or a live client site and *look* at it — navigate, click, screenshot,
read the console, check network. This is what satisfies the two project rules that can't be
satisfied by reading code: **pins are position-sensitive** (verify against a real render) and
**Hebrew/RTL must be eyeballed in a browser** before it ships.

- **It is not your everyday Chrome.** The server drives its own persistent profile at
  `~/.cache/chrome-devtools-mcp/chrome-profile`. Your bookmarks, logins, and history are not
  exposed. The tradeoff: that profile keeps its *own* localStorage, so the `qqwe` owner gate
  and the dashboard's site tabs persist there across sessions — unlock it once.
- **Viewport is pinned to 1440x900** so pin coordinates are reproducible between runs. Change
  it in `.mcp.json`, not per-call, or screenshots stop being comparable.
- **Phoning home is off**: `--no-usage-statistics` (no Google usage telemetry) and
  `--no-performance-crux` (performance traces would otherwise POST the visited URL to
  Google's CrUX API — that would leak capability tokens and unlisted client draft URLs).
  Leave both off; that's the brand-IP rule, not a preference.
- **First use per machine** prompts to approve the project-scope server; it loads at session
  start, so after editing `.mcp.json` you must restart the session.
- **To drive your own logged-in Chrome instead** (rarely needed here — only if a page requires
  a session the MCP profile can't get), quit Chrome, relaunch with
  `--remote-debugging-port=9222`, and add `"--browserUrl", "http://127.0.0.1:9222"` to the
  args. That exposes every open tab to the session — real cost, use deliberately.

## Honest security posture

Board key = public domain by design. Anyone who knows it can read/post notes on that board.
The `qqwe`/`pds` gates are courtesy gates in client-side JS, not security. Confidential
project? Use a secret UUID board key (PLAN.md §8). The Supabase **secret** key lives only in
`reviews/secret.local.json` (gitignored) — never in a browser, chat, or commit.
