# APIs & credentials — what this project talks to, and with what key

Companion to [OPERATIONS.md](OPERATIONS.md) (how to *operate* the loop). This file is
the *plumbing*: every external service, every credential, where it comes from, and what
happens if it leaks. Written to be readable cold.

---

## The one idea behind all the keys

There are two kinds of key in this project, and confusing them is the only way to get
hurt:

| | **Public key** | **Secret key** |
|---|---|---|
| Looks like | `sb_publishable_…` | `sb_secret_…` |
| Lives in | `config.js` — committed, shipped to every visitor's browser | `.env` — gitignored, this machine only |
| Can do | only what row-level security (RLS) allows: read/write notes for the one board you name | **everything**, bypasses RLS entirely |
| If it leaks | nothing — it's public by design | someone can read and delete every client's feedback |

The public key is safe in a browser *because* the database enforces rules on top of it.
The secret key is the key that turns those rules off, so it never touches a browser, a
commit, or a chat message.

---

## 1. Supabase — the database everything flows through

Project `vfdhlrikxcdturtvyxel.supabase.co`. It's hosted Postgres with an auto-generated
REST API in front of it (the API layer is called PostgREST — you never install it, every
table just gets a URL).

**Tables** (defined in [schema.sql](../schema.sql) and [review-os-core.sql](../review-os-core.sql)):

| Table | Holds |
|---|---|
| `projects` | one row per reviewed site — board key, real `site_host` |
| `notes` | the pins/notes reviewers drop; status, disposition, flag reason |
| `comments` | replies on a note |
| `attachments` | uploaded images (needs the storage bucket — not built yet) |
| `clients` | client → `repo` (which GitHub repo their fixes land in) |
| `deliverables` | Review-OS work items |

**Who calls it:**
- [embed.js](../embed.js) — the widget in the reviewer's browser, using the public key.
- [sync.mjs](../sync.mjs) — the local puller. Uses the secret key if present ([sync.mjs:74](../sync.mjs#L74)); otherwise falls back to the public key plus an `x-board-key` header, which is why **per-board pulls work with no secret at all**.
- [dashboard.html](../dashboard.html) — your control panel, public key.

**Credential:** `WR_SECRET_KEY` in `.env`.
**Get it:** supabase.com → this project → Settings → API keys → *secret*.
**Only unlocks:** `node sync.mjs` with no arguments (pull every board at once). Everything
else already works without it.
**Docs:** [PostgREST querying](https://supabase.com/docs/guides/api) · [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) · [API keys explained](https://supabase.com/docs/guides/api/api-keys)

---

## 2. Git — version control on your own machine

Git is local. It needs no key. It records who made each change from your configured
name/email, which is why that must be set or your commits won't link to your GitHub
account.

```bash
git status -sb          # what changed, and am I ahead of GitHub
git log --oneline -5    # recent history
git switch -c fix/thing # start a branch
git worktree list       # other sessions' checkouts (this repo uses them)
```

**Docs:** [Pro Git book (free)](https://git-scm.com/book/en/v2) · [reference](https://git-scm.com/docs)

---

## 3. GitHub — three different things wearing one name

This is the part that confuses everyone, so: GitHub is reached **three separate ways**
here, each with its own credential.

### 3a. `git push` / `git pull` — moving code
Authenticated through the `gh` CLI's stored credential helper. **Already working** on this
machine (account `yoniversefilms`). Nothing to set up.

### 3b. `gh` CLI — opening pull requests
This is what the `/fix-queue` skill uses at step 7 to open a PR.

```bash
gh auth status                      # who am I
gh pr create --title "…" --body "…" # open a PR
gh pr list / gh pr view <n>
```

**Credential:** a token in the macOS keyring, created by `gh auth login`. **Already
present**, scopes `repo`, `workflow`, `gist`, `read:org`.
**Docs:** [gh manual](https://cli.github.com/manual/) · [REST API](https://docs.github.com/en/rest)

### 3c. GitHub REST API from the dashboard — the Builds panel
[dashboard.html](../dashboard.html) calls `api.github.com/repos/…/pulls` to show open PRs
so you can approve/merge from the panel. This runs **in your browser**, which cannot reach
the `gh` CLI's keyring — so it needs its own token, pasted into the 🔑 button and stored in
that browser's localStorage only ([dashboard.html:486-500](../dashboard.html#L486-L500)).

**This is the "GitHub token" the handoff is blocked on.** It does *not* go in `.env`.

**Get it:** [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
→ fine-grained token → repository access: only the repos you review → permissions:
**Pull requests: Read and write**, **Contents: Read-only** → generate → paste into 🔑.
**Docs:** [fine-grained PATs](https://docs.github.com/en/authentication/keeping-your-account-secure/managing-your-personal-access-tokens) · [Pulls API](https://docs.github.com/en/rest/pulls/pulls)

---

## 4. GitHub Pages — where the drafts and dashboard are served

Static hosting straight off a repo. No API, no key; you enable it once per repo in
Settings → Pages and pushes to the branch republish it. This is how reviewers reach a
draft at `yoniversefilms.github.io/<repo>/` and how the widget gets loaded over HTTPS.
**Docs:** [Pages](https://docs.github.com/en/pages/getting-started-with-github-pages)

---

## Credential map — the whole picture

| Credential | Lives in | Used by | Status |
|---|---|---|---|
| Supabase publishable key | `config.js` (committed) | widget, dashboard, sync fallback | ✅ in place |
| Supabase **secret** key | `.env` → `WR_SECRET_KEY` | `node sync.mjs` (all boards) | ⬜ **you paste this** |
| GitHub push credential | macOS keyring via `gh` | `git push`, `gh pr create` | ✅ already authenticated |
| GitHub fine-grained PAT | browser localStorage via 🔑 | dashboard Builds panel | ⬜ **you paste this** |
| Git identity | `git config user.name` / `user.email` | every commit | set per-repo, see below |

**Never:** commit `.env`, put `sb_secret_` in `config.js` or any `.html`, paste a token
into chat or a task file, or reuse one client's key for another.

**If a key leaks:** rotate it at the source (Supabase → API keys → roll; GitHub → delete
the token) — changing the file is not enough, the old value stays valid until revoked.
