// config.js — the ONE file you edit to set up the review tool.
// The Supabase publishable key is PUBLIC by design (protected by RLS + the
// secret project key). Safe to commit. NEVER put a secret (sb_secret_...) key here.

window.WR_CONFIG = {
  supabaseUrl:  "https://vfdhlrikxcdturtvyxel.supabase.co",
  supabaseAnon: "sb_publishable_fwm9wkESvRdRLFNcnDC64A_vkpcdELa", // publishable key (browser-safe)

  // Default reviewer display name; each browser can override it in-page.
  me: "Reviewer",
};

// The PROJECT KEY is NOT stored here. It arrives per-session via:
//   1. ?review=<project_key>  in the URL  (the reviewer link), or
//   2. a  data-review-key="<project_key>"  attribute on the embed <script> tag.
// The widget stays DORMANT (invisible to normal site visitors) until a
// project key is present — so the snippet is safe to leave in production.
