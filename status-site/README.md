# status-site: Cloudflare Pages build for status.getcoliseum.com

Gate option 1 (SEC-ALL-PRODUCTS-1). This replaces Upptime's GitHub Pages build, so the status page gets real security headers (`_headers`) and a pinned build (OWASP A06).

- `package.json` + `package-lock.json` pin `@upptime/status-page` to exactly 1.17.0, checked by integrity hash.
- `app/package.json` is that version's own package.json, minus its test and release tools (cypress, jest, semantic-release, @koj/config, npm-run-all), which the export never runs. `app/package-lock.json` pins every package it builds with.
- `build.mjs` does what Upptime's site.ts does (export, copy `../assets`), adds `_headers`, and swaps Sapper's eval-based loader for a plain module load so the CSP needs no `'unsafe-eval'` and no `blob:`. It stops with an error if that loader ever changes.

Cloudflare Pages settings: root directory `status-site`, build command `npm ci --ignore-scripts && npm run build`, output `dist`, env `NODE_VERSION=22`. Build watch paths: include `.upptimerc.yml`, `assets/*`, `status-site/*`. Upptime Bot data commits don't rebuild; the page reads live data from GitHub.

To update the status page: change the version in `package.json`, run `npm install`, copy `node_modules/@upptime/status-page/package.json` to `app/`, remove the same test and release tools, run `npm install --package-lock-only` in `app/`, then build and test. It goes through the gate like any change.
