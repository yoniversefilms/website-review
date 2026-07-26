# 7.25 Handoff — Review OS (Website review)

**Project:** Website Review Widget / Review OS · **Date:** 2026-07-25 (evening)
**This session:** dashboard hardening + cleanup + operator docs · **Suggested successor:** "Review OS Session — ruth-site migration"

## Where work stands

**Done this session (all deployed to Pages, main @ 5cca5eb, pushed):**
- Owner gate on `dashboard.html` (code `qqwe`, per-browser; courtesy gate, not security).
- Per-site tabs (chip row, open counts, ✕ removes a board from the browser list).
- 📖 Guide panel in the dashboard + `docs/OPERATIONS.md` (links, loop, token steps, new-client checklist).
- Fixed broken open links: dashboard prefers registered `site_host` (keeps `www.`), group ↗ open lands on the noted page; `embed.js` now registers the unstripped hostname. Healed both bad Supabase `projects.site_host` rows by hand (`ruthpedida.co.il` → www…, `ruth-v5-draft` → yoniversefilms.github.io).
- Fixed `sync.mjs` --push false-conflict (remote select was missing `disposition,flag_reason` — sync.mjs:103 area).
- Cleared 12 test notes off `lovedustfilms.com` (now in Built tab, recoverable). Ruth's real Hebrew note on `ruthpedida.co.il` (mobile button too small, author רות) left OPEN/untriaged deliberately.
- New skill: `/fix-queue <slug>` (`.claude/skills/fix-queue/`).
- Supabase: `clients.repo` for `ruth` → `yoniversefilms/website-review` (TEMPORARY, until ruth-site exists).

**In flight:**
- 🌳 **Spun-off worktree** `.claude/worktrees/interesting-blackburn-431420` (branch `claude/interesting-blackburn-431420`, forked at 5bbec5e) — separate session working task "Lock clients.repo writes to owner in RLS" (anon key can PATCH `clients.repo`; verified live). Its SQL migration has NOT landed on main. One writer per file: don't touch `*.sql`/README setup list until it merges or dies.
- End-to-end loop test on the `ruth-v5-draft` note "remove those 3 dots" — waiting on Yonatan to add his GitHub token (steps in the dashboard Guide panel), then run `/fix-queue ruth-v5`. Target: [drafts/ruth-v5/index.html:726](../../drafts/ruth-v5/index.html) (`dd-dots` doodle in `#problem`); same motif at 847/870/893 stays unless Yonatan widens scope.
- Commit 58cb7a7 (Abby draft) came from ANOTHER session after this one's last deploy — UNVERIFIED here whether pushed; successor: `git status -sb` before assuming.

**Blocked / waiting on operator:** GitHub token paste (🔑); merge decision on the test PR once opened.

## Decisions made (why)
- Ruth gets her OWN repo, fresh history, **private** (operator has GH Pro) — client work never lives in the tool repo. Migration is APPROVED but deliberately AFTER the end-to-end test passes on the current layout.
- Board keys are explicit (`WR_CONFIG.projectKey`) so notes survive URL moves — this is what makes the migration safe.
- Test notes were resolved, not deleted (anon key can't delete; audit trail stays).

## Exact next steps (in order)
1. Finish the end-to-end test: operator pastes token → `/fix-queue ruth-v5` → PR → operator merges/flags in Builds panel → on merge, mark resolved in `~/Documents/Ruth/reviews/ruth-v5-draft/feedback.json`, then `node sync.mjs ruth-v5 --push`.
2. Then the migration (plan agreed in-session): create private `yoniversefilms/ruth-site` (fresh history) → move `drafts/ruth-v5/` → local clone `~/Documents/Ruth/site/` → enable Pages → `update clients set repo='yoniversefilms/ruth-site' where client_key='ruth';` → update `reviews/config.json` outs → remove draft from tool repo only after verifying Hebrew/RTL render at the new URL in a real browser.
3. Check the worktree task's RLS SQL landed; if merged, add it to README's setup list.

## Read first
1. `docs/OPERATIONS.md` — architecture + operating manual (links, token, new-client wiring).
2. `.claude/skills/fix-queue/SKILL.md` — the loop's contract (branch, PR conventions, never merge).
3. `reviews/config.json` — board→path routing (ruth-v5 out: `~/Documents/Ruth/reviews/ruth-v5-draft`).

## Warnings
- The worktree session (above) may be editing SQL/README — coordinate before touching.
- `clients.repo` for ruth is a temporary pointer at the tool repo; forgetting to repoint it after migration silently shows the wrong PRs in Builds.
- Secret key: still no `reviews/secret.local.json` on this machine — `node sync.mjs` (all-boards) won't run; per-board pulls work.

## First actions for the successor
1. Read this file + the three read-first files.
2. `git status -sb` and `git worktree list` — learn what the other sessions did since.
3. Mark the baton received: set `"handoff_ready": false` in `tower/status.json` (merge, don't clobber).
4. `node sync.mjs ruth-v5` — confirm where the 3-dots note stands before doing anything.
