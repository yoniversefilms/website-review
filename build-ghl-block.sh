#!/usr/bin/env bash
# Regenerate ghl-review-block.html from embed.js — a self-contained block to paste
# into GHL (Settings > Tracking Code > Body). Escapes </script> so the inlined
# widget can't prematurely close the wrapping <script> tag.
set -euo pipefail
cd "$(dirname "$0")"

SUPABASE_URL="https://vfdhlrikxcdturtvyxel.supabase.co"
SUPABASE_KEY="sb_publishable_fwm9wkESvRdRLFNcnDC64A_vkpcdELa"

{
  printf '%s\n' '<!-- Website Review widget — GHL paste block. Paste into your funnel/site > Settings > Tracking Code > BODY (footer) field, then Save + Re-publish. Dormant for visitors; loads nothing until the page URL has ?review=<project_key>. Regenerate with build-ghl-block.sh; do not hand-edit the script below. -->'
  printf '<script>window.WR_CONFIG={supabaseUrl:"%s",supabaseAnon:"%s",me:"Reviewer"};</script>\n' "$SUPABASE_URL" "$SUPABASE_KEY"
  printf '%s\n' '<script>'
  sed 's#</script>#<\\/script>#g' embed.js
  printf '%s\n' '</script>'
} > ghl-review-block.html

raw=$(grep -c '</script>' ghl-review-block.html || true)
echo "built ghl-review-block.html ($(wc -l < ghl-review-block.html) lines; raw </script>=$raw, expect 2)"
