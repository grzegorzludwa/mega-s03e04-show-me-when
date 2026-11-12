#!/usr/bin/env bash
# Copies app/ to dist/ and stamps the build sha (R6). Usage: scripts/build.sh [sha]
set -euo pipefail
cd "$(dirname "$0")/.."
SHA="${1:-$(git rev-parse HEAD)}"
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "bad sha: $SHA" >&2; exit 1; }
rm -rf dist && cp -r app dist
sed -i "s/__BUILD_SHA__/$SHA/g" dist/index.html
grep -q "$SHA" dist/index.html && ! grep -rq __BUILD_SHA__ dist
echo "dist/ stamped with $SHA"
