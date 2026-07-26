// config.js — the ONE file you edit to set up the review tool.
// The Supabase publishable key is PUBLIC by design (protected by RLS). Safe to
// commit. NEVER put a secret (sb_secret_...) key here.

window.WR_CONFIG = {
  supabaseUrl:  "https://vfdhlrikxcdturtvyxel.supabase.co",
  supabaseAnon: "sb_publishable_fwm9wkESvRdRLFNcnDC64A_vkpcdELa", // publishable key (browser-safe)

  // No default name: each reviewer is asked once (stored in localStorage wr:name),
  // so notes are attributed correctly. Set `me` only for a headless/dev override.
};

// ACTIVATION: the widget is DORMANT for normal visitors and loads nothing until
// the page URL carries ?review (any value) — e.g. https://site.com/?review=1.
//
// BOARD (the project key — which review the notes belong to). Resolved in order:
//   1. ?board=<id> in the URL
//   2. data-review-key="<id>" on the embed <script> tag
//   3. WR_CONFIG.projectKey            <-- SET THIS for anything long-lived
//   4. auto-derived (see below)
//
// AUTO-DERIVATION is host-aware, because a hostname-only key MERGES projects:
//   - Custom domain (the site owns that hostname) -> the bare domain.
//       lovedustfilms.com/about/ -> "lovedustfilms.com"
//   - Shared host (github.io, netlify.app, vercel.app, framer.website, localhost,
//     raw IPs…) where many projects answer to ONE hostname -> host + directory:
//       yoniversefilms.github.io/abby-site/home.html  -> "yoniversefilms.github.io/abby-site"
//       yoniversefilms.github.io/ruth-site/index.html -> "yoniversefilms.github.io/ruth-site"
//     Without this those two share a board and mix two clients' feedback.
//
// The auto key is a safety net, not a plan: it changes if the site moves to its
// own domain or a different folder, orphaning the old board's notes. Set an
// explicit projectKey for any project you intend to keep. The resolved key is
// logged to the console on every load (and exposed as window.__wrBoard).
//
// For a site that needs real confidentiality, pass a secret UUID via one of the
// overrides and treat that reviewer link as the password (see PLAN.md §8).
