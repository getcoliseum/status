// Builds status.getcoliseum.com for Cloudflare Pages (gate option 1, SEC-ALL-PRODUCTS-1).
// Same steps as Upptime's site.ts, but every package is pinned by a committed lockfile (OWASP A06):
//   1. package-lock.json here pins @upptime/status-page to 1.17.0 (npm ci checks its integrity hash).
//   2. app/package-lock.json pins every package the status page needs to build.
// Output: status-site/dist (Cloudflare Pages "Build output directory").
import { execSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const pkgDir = join(here, "node_modules", "@upptime", "status-page");
const work = join(here, "work");
const dist = join(here, "dist");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: "true" } });

const pinned = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
const appPin = JSON.parse(readFileSync(join(here, "app", "package.json"), "utf8")).version;
if (pinned !== appPin) throw new Error(`status-page ${pinned} does not match app/package.json ${appPin}: regenerate app/ (see README)`);

rmSync(work, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });
mkdirSync(work);
for (const f of readdirSync(pkgDir)) if (f !== "package.json" && f !== "node_modules") cpSync(join(pkgDir, f), join(work, f), { recursive: true });
cpSync(join(here, "app", "package.json"), join(work, "package.json"));
cpSync(join(here, "app", "package-lock.json"), join(work, "package-lock.json"));
// pre-process.ts and post-process.ts read ../.upptimerc.yml from the work folder.
cpSync(join(repo, ".upptimerc.yml"), join(here, ".upptimerc.yml"));

run("npm ci --ignore-scripts --no-audit --no-fund --loglevel=error", work);
run("npm run export", work);

cpSync(join(work, "__sapper__", "export"), dist, { recursive: true });
if (existsSync(join(repo, "assets"))) cpSync(join(repo, "assets"), dist, { recursive: true });
cpSync(join(here, "_headers"), join(dist, "_headers"));

// Sapper's boot script feature-tests with eval() and new Function(). Under a header CSP without 'unsafe-eval' both
// throw, so it falls back to shimport, which runs code from blob: URLs that the CSP blocks. Every browser that can
// render this page supports ES modules, so load the module bundle directly. Fails the build if Sapper changes.
const loader = /\(function\(\)\{try\{eval\("async function x\(\)\{\}"\);var main="(\/client\/client\.[0-9a-f]+\.js)"\}catch\(e\)\{main="[^"]+"\};var s=document\.createElement\("script"\);try\{new Function\("if\(0\)import\(''\)"\)\(\);s\.src=main;s\.type="module";s\.crossOrigin="use-credentials";\}catch\(e\)\{s\.src="[^"]+";s\.setAttribute\("data-main",main\);\}document\.head\.appendChild\(s\);\}\(\)\);/;
let patched = 0;
for (const f of readdirSync(dist).filter((n) => n.endsWith(".html"))) {
  const file = join(dist, f);
  const html = readFileSync(file, "utf8");
  if (!html.includes("__SAPPER__")) continue;
  if (!loader.test(html)) throw new Error(`Sapper loader not found in ${f}: check the build after a status-page update`);
  writeFileSync(file, html.replace(loader, (_, main) => `(function(){var s=document.createElement("script");s.src="${main}";s.type="module";s.crossOrigin="use-credentials";document.head.appendChild(s);}());`));
  patched++;
}
if (patched === 0) throw new Error("no pages patched");

// Allow only the exact inline scripts Sapper wrote, by hash, instead of 'unsafe-inline' for scripts.
const hashes = new Set();
for (const f of readdirSync(dist).filter((n) => n.endsWith(".html"))) {
  const html = readFileSync(join(dist, f), "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]+>/.test(html) || /\son[a-z]+=/i.test(html)) throw new Error(`unexpected inline script form in ${f}`);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) hashes.add(`'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
}
const marker = "script-src 'self' 'unsafe-inline';";
const headers = readFileSync(join(dist, "_headers"), "utf8");
if (!headers.includes(marker) || hashes.size === 0) throw new Error("cannot pin inline script hashes in _headers");
writeFileSync(join(dist, "_headers"), headers.replace(marker, `script-src 'self' ${[...hashes].sort().join(" ")};`));
rmSync(join(dist, "CNAME"), { force: true }); // GitHub Pages only
console.log("status-site built:", readdirSync(dist).length, "entries in dist,", patched, "pages patched,", hashes.size, "inline script hashes, status-page", pinned);
