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
// BOARD (which review it belongs to) = the site's own domain by default, so ONE
// snippet works on every site with no per-site key. Overrides, in order:
//   1. ?board=<id> in the URL
//   2. data-review-key="<id>" on the embed <script> tag
//   3. WR_CONFIG.projectKey
// For a site that needs real confidentiality, pass a secret UUID via one of the
// overrides and treat that reviewer link as the password (see PLAN.md §8).
