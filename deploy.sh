#!/usr/bin/env bash
# One-shot deploy: verify -> rebuild inline block -> commit -> push (Pages auto-deploys).
# Usage: ./deploy.sh "commit message"
set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-Update review widget}"

echo "== 1/4 syntax checks =="
node --check embed.js && echo "  embed.js OK"
node --check sync.mjs && echo "  sync.mjs OK"

echo "== 2/4 rebuild inline GHL block =="
./build-ghl-block.sh

echo "== 3/4 commit =="
git add -A
git -c user.name="Yonatan" -c user.email="yonires1@gmail.com" commit -m "$MSG

Co-Authored-By: Claude <noreply@anthropic.com>" || echo "  (nothing to commit)"

echo "== 4/4 push (GitHub Pages auto-deploys ~30s) =="
git push origin main
echo "done — verify at https://yoniversefilms.github.io/website-review/embed.js"
