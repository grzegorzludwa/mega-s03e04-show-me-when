# Build notes (S03E04)

- `scripts/build.sh [sha]` copies `app/` to `dist/` and stamps the sha into `<meta name="build">` and the footer.
- `node test/board.test.mjs` runs offline browser tests for SCHED-4511..4514 (API mocked). `CHROME=/path` picks a browser.
- `.github/workflows/pages.yml` deploys to GitHub Pages on every push to `main`.
