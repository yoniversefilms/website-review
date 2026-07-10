#!/usr/bin/env node
/* =====================================================================
 * sync.mjs — the bridge between reviewer feedback and Claude.
 * ---------------------------------------------------------------------
 *   node sync.mjs <slug>          PULL  -> feedback.json + feedback.md (+ photos)
 *   node sync.mjs <slug> --push   PUSH  -> status/resolution changes back to Supabase
 *
 * Config: reviews/config.json  (supabaseUrl, anonKey, projects{slug:{board,out}}).
 * The publishable key is public by design; nothing secret lives here.
 * Direction of truth: note CONTENT flows Supabase->file (read-only); STATUS +
 * RESOLUTION flow file->Supabase on --push. Edit only feedback.json, never .md.
 * ===================================================================== */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [, , slug, ...flags] = process.argv;
const PUSH = flags.includes("--push");
if (!slug) { console.error("usage: node sync.mjs <slug> [--push]"); process.exit(1); }

const cfg = JSON.parse(await readFile(path.join(HERE, "reviews", "config.json"), "utf8"));
const proj = cfg.projects[slug];
if (!proj) { console.error(`unknown project "${slug}". known: ${Object.keys(cfg.projects).join(", ")}`); process.exit(1); }

const BOARD = proj.board;
const OUT = proj.out || path.join(HERE, "reviews", slug);
const REST = cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1";
const H = { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey, "x-board-key": BOARD };

async function api(q, opts = {}) {
  const r = await fetch(REST + q, { ...opts, headers: { ...H, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${q} -> ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

await mkdir(OUT, { recursive: true });

/* ---------------- PUSH: status/resolution back to Supabase ---------------- */
if (PUSH) {
  const local = JSON.parse(await readFile(path.join(OUT, "feedback.json"), "utf8"));
  let n = 0;
  for (const note of local.notes) {
    await api(`/notes?id=eq.${note.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: note.status, resolution: note.resolution ?? null, updated_by: "Yonatan/Claude" }),
    });
    n++;
  }
  console.log(`pushed status/resolution for ${n} notes -> board ${BOARD}`);
  process.exit(0);
}

/* ---------------- PULL: Supabase -> feedback.{json,md} + photos ---------------- */
const notes = (await api(`/notes?project_key=eq.${encodeURIComponent(BOARD)}&order=created_at.asc`)) || [];
const comments = (await api(`/comments?project_key=eq.${encodeURIComponent(BOARD)}&order=created_at.asc`)) || [];
const attachments = (await api(`/attachments?project_key=eq.${encodeURIComponent(BOARD)}`)) || [];

// download any photos locally (idempotent)
const pubBase = cfg.supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/review-photos/";
for (const a of attachments) {
  const rel = `photos/${a.note_id}/${path.basename(a.storage_path)}`;
  const dest = path.join(OUT, rel);
  if (existsSync(dest)) continue;
  try {
    const r = await fetch(pubBase + a.storage_path);
    if (r.ok) { await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, Buffer.from(await r.arrayBuffer())); }
  } catch (e) { console.warn("photo download failed:", a.storage_path, e.message); }
}

const commentsOf = (id) => comments.filter((c) => c.note_id === id);
const photosOf = (id) => attachments.filter((a) => a.note_id === id).map((a) => `photos/${id}/${path.basename(a.storage_path)}`);

const doc = {
  project: slug,
  board: BOARD,
  pulled_at: new Date().toISOString(),
  notes: notes.map((n, i) => ({
    id: n.id, num: i + 1, kind: n.kind, status: n.status, resolution: n.resolution ?? null,
    page_url: n.page_url, section_id: n.section_id, target_selector: n.target_selector,
    target_text: n.target_text, elem_desc: n.elem_desc, body: n.body, author: n.author,
    created_at: n.created_at, updated_at: n.updated_at,
    photos: photosOf(n.id),
    comments: commentsOf(n.id).map((c) => ({ author: c.author, body: c.body, at: c.created_at })),
  })),
};
await writeFile(path.join(OUT, "feedback.json"), JSON.stringify(doc, null, 2));

// human/Claude-readable mirror, grouped OPEN first
const isOpen = (n) => n.status === "open" || n.status === "in_progress";
const open = doc.notes.filter(isOpen);
const done = doc.notes.filter((n) => !isOpen(n));
const render = (n) => {
  const L = [];
  L.push(`### [#${n.num}] ${n.kind} · **${n.status}**${n.resolution ? ` — ${n.resolution}` : ""} · ${n.author || "?"} · ${(n.created_at || "").slice(0, 10)}`);
  L.push(`- **Where:** \`${n.target_selector || (n.section_id ? "#" + n.section_id : n.page_url)}\`${n.elem_desc ? ` — ${n.elem_desc}` : ""}`);
  if (n.target_text) L.push(`- **Text on/near it:** «${n.target_text}»`);
  L.push(`- **Note:** ${n.body}`);
  if (n.photos.length) L.push(`- **Photos:** ${n.photos.join(", ")}`);
  n.comments.forEach((c) => L.push(`  - ↳ ${c.author}: ${c.body}`));
  L.push(`<!-- id:${n.id} -->`);
  return L.join("\n");
};
const md = [
  `# Review feedback — ${slug}  ·  board \`${BOARD}\``,
  `_Pulled ${doc.pulled_at}. Generated by sync.mjs — DO NOT hand-edit this file._`,
  `_To locate each note: match its \`#section_id\` + the verbatim «Text» in the site's index.html._`,
  `_To resolve: set status/resolution in feedback.json, then \`node sync.mjs ${slug} --push\`._`,
  ``,
  `## 🟡 OPEN (${open.length})`,
  ``,
  open.length ? open.map(render).join("\n\n") : "_none_",
  ``,
  `## ✅ RESOLVED / OTHER (${done.length})`,
  ``,
  done.length ? done.map(render).join("\n\n") : "_none_",
  ``,
].join("\n");
await writeFile(path.join(OUT, "feedback.md"), md);

console.log(`pulled ${doc.notes.length} notes (${open.length} open) for board "${BOARD}"`);
console.log(`  -> ${path.join(OUT, "feedback.md")}`);
console.log(`  -> ${path.join(OUT, "feedback.json")}`);
